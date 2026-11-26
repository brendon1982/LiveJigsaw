import Phaser from 'phaser';
import type { Point } from '../domain/geometry';
import type { Puzzle } from '../domain/Puzzle';
import type { TrayFractions, TrayPosition } from '../persistence/GameSave';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import { makeIconButton, type UIScene } from './button';
import { drawEffectImage, effectImageResolution, traceEffectPath } from './effectImage';
import { PannableBoard } from './PannableBoard';
import { PieceTray } from './PieceTray';
import { PlacementEffects } from './PlacementEffects';
import { playWorkspace, resolveTraySide, trayScrollAxis, type TraySide } from './playLayout';
import { headerControlGap } from './puzzleHeader';
import { PuzzlePanels } from './PuzzlePanels';
import { PuzzlePieceView } from './PuzzlePieceView';
import { SeedDropFeedback } from './SeedDropFeedback';

type DropTrigger = 'release' | 'click';

type Gesture = { pointerId: number } & (
  | { kind: 'tray-press'; entry: PuzzlePieceView; start: Point; canTap: boolean }
  | { kind: 'piece'; entry: PuzzlePieceView; offset: Point; dropOn: DropTrigger }
  | { kind: 'pan'; pointer: Phaser.Input.Pointer; previous: Point }
  | { kind: 'scroll'; previous: Point }
);

type Pinch = {
  fingers: readonly [Phaser.Input.Pointer, Phaser.Input.Pointer];
  center: Point;
  span: number;
};

type TraySettings = {
  position: TrayPosition;
  fractions: TrayFractions;
  onResize: (fractions: TrayFractions) => void;
};

type PuzzleActions = {
  onPlacement: () => void;
  onTurn: () => void;
};

const tapSlop = 6;
const pieceDragThreshold = 8;
const pieceDragSlope = Math.tan(70 * Math.PI / 180);
const trayScrollThreshold = 20;
const traySlideDuration = 560;
const boardDirection: Record<TraySide, number> = { Left: 1, Right: -1, Top: 1, Bottom: -1 };

function measurePinch(a: Point, b: Point) {
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    span: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
  };
}

function drawFitBoardIcon(art: Phaser.GameObjects.Graphics, color: number) {
  art.clear().lineStyle(2, color).beginPath();
  art.moveTo(-10, 0).lineTo(10, 0);
  art.moveTo(0, -10).lineTo(0, 10);
  art.moveTo(-6, -4).lineTo(-10, 0).lineTo(-6, 4);
  art.moveTo(6, -4).lineTo(10, 0).lineTo(6, 4);
  art.moveTo(-4, -6).lineTo(0, -10).lineTo(4, -6);
  art.moveTo(-4, 6).lineTo(0, 10).lineTo(4, 6);
  art.strokePath();
}

export class PuzzleBoardView {
  private readonly tray: PieceTray;
  private readonly board: PannableBoard;
  private readonly fitButton: ReturnType<typeof makeIconButton>;
  private readonly placementEffects: PlacementEffects;
  private seedDropFeedback?: SeedDropFeedback;
  private readonly floatingPieces: Phaser.GameObjects.Layer;
  private liftShadow?: Phaser.GameObjects.Image;
  private rejectedPiece?: PuzzlePieceView;
  private readonly pieces: PuzzlePieceView[];
  private trayBounds = new Phaser.Geom.Rectangle();
  private trayPosition: TrayPosition;
  private side: TraySide;
  private panels?: PuzzlePanels;
  private readonly resize: () => void;
  private gesture?: Gesture;
  private pinch?: Pinch;
  private completionStage: 'playing' | 'revealing' | 'finished' = 'playing';
  private traySlide?: Phaser.Tweens.Tween;

  constructor(
    private readonly scene: UIScene,
    private readonly puzzle: Puzzle,
    capture: LivePuzzleCapture,
    trayPieceSize: number,
    traySettings: TraySettings,
    private readonly actions: PuzzleActions,
  ) {
    const placedPieces = puzzle.pieces.filter(({ id }) => puzzle.isPlaced(id));
    this.pieces = puzzle.trayPieces.map((piece) => {
      const entry = new PuzzlePieceView(scene, capture, piece);
      entry.setOrientation(puzzle.orientationOf(piece.id));
      return entry;
    });
    this.updateTrayAvailability();

    this.trayPosition = traySettings.position;
    this.side = resolveTraySide(this.trayPosition, scene.scale.gameSize);
    this.tray = new PieceTray(scene, this.pieces, puzzle.board.cellSize, trayPieceSize, trayScrollAxis(this.side), puzzle.pieceRotation);
    this.board = new PannableBoard(scene, puzzle.board.size, capture, puzzle.hidesGuide);
    this.board.addPieces(placedPieces);
    this.fitButton = makeIconButton(scene, 'Fit board', drawFitBoardIcon, (pointer) => {
      if (pointer.wasCanceled) return;
      this.cancelInteraction();
      this.fitBoard();
    }).setVisible(false);
    this.placementEffects = new PlacementEffects(scene, this.board.layer);
    this.floatingPieces = scene.add.layer();
    this.fitButton.addToLayer(this.floatingPieces);
    const dragCamera = scene.cameras.add().setName('Board overlay');

    // The panel cameras clip their own layers. The overlay draws above both panels.
    scene.cameras.main.ignore([this.tray.layer, this.board.layer, this.floatingPieces]);
    const layers = [
      [this.tray.camera, this.tray.layer],
      [this.board.camera, this.board.layer],
      [dragCamera, this.floatingPieces],
    ] as const;
    const clipLayers = () => {
      for (const [camera, layer] of layers) {
        for (const object of scene.children.getChildren()) {
          if (object !== layer) object.cameraFilter |= camera.id;
        }
      }
    };

    let trayFractions = traySettings.fractions;
    this.resize = () => {
      this.cancelInteraction();
      const { gameSize } = scene.scale;
      const workspace = playWorkspace(gameSize);
      dragCamera.setViewport(0, 0, gameSize.width, gameSize.height);
      this.seedDropFeedback?.layout(gameSize);
      if (this.completionStage !== 'playing') {
        const finishSlide = this.completionStage === 'revealing';
        if (finishSlide) {
          this.traySlide?.remove();
          this.traySlide = undefined;
          this.completionStage = 'finished';
        }
        this.layoutBoard(this.panels!.layoutBoardOnly(workspace));
        if (finishSlide) this.fitBoard();
        return;
      }
      const side = resolveTraySide(this.trayPosition, gameSize);
      const axis = trayScrollAxis(side);
      const orientation = axis === 'y' ? 'vertical' : 'horizontal';
      if (!this.panels || side !== this.side) {
        this.panels?.destroy();
        this.side = side;
        this.tray.setScrollAxis(axis);
        this.panels = new PuzzlePanels(scene, side, (trayBounds, boardBounds) => {
          this.trayBounds = trayBounds;
          this.tray.layout(trayBounds);
          this.layoutBoard(boardBounds);
        }, (fraction) => {
          trayFractions = { ...trayFractions, [orientation]: fraction };
          traySettings.onResize(trayFractions);
        });
        clipLayers();
      }
      this.panels.layout(workspace, this.tray.minimumSize, trayFractions[orientation]);
    };
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize);
    this.resize();
    this.fitBoard();

    scene.input.on('pointerdown', this.startGesture);
    scene.input.on('pointermove', this.moveGesture);
    scene.input.on('pointerup', this.endGesture);
    scene.input.on('pointerupoutside', this.cancelGesture);
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.handleWheel);
  }

  destroy() {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.resize);
    this.scene.input.off('pointerdown', this.startGesture);
    this.scene.input.off('pointermove', this.moveGesture);
    this.scene.input.off('pointerup', this.endGesture);
    this.scene.input.off('pointerupoutside', this.cancelGesture);
    this.scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.handleWheel);
    this.scene.input.setDefaultCursor('default');
    this.traySlide?.remove();
    this.tray.destroy();
    this.clearLiftShadow();
    this.seedDropFeedback?.destroy();
    this.placementEffects.destroy();
    this.board.destroy();
    for (const { mask } of this.pieces) this.scene.textures.remove(mask);
  }

  setTrayPosition(position: TrayPosition) {
    if (this.trayPosition === position) return;
    this.trayPosition = position;
    this.resize();
  }

  showCompletion() {
    this.completionStage = 'revealing';
    this.updateFitButton();
    this.board.revealFinishedArtwork();
    this.tray.hide();
    this.trayBounds.setTo(0, 0, 0, 0);

    const workspace = playWorkspace(this.scene.scale.gameSize);
    const panels = this.panels!;
    const startingBounds = panels.beginTraySlide();
    const fitFrame = this.board.beginFitTransition(workspace);
    this.traySlide = this.scene.tweens.addCounter({
      from: 0, to: 1, duration: traySlideDuration, ease: 'Sine.InOut',
      onUpdate: (tween) => {
        const progress = tween.getValue() ?? 0;
        fitFrame(panels.layoutTraySlide(workspace, startingBounds, progress), progress);
      },
      onComplete: () => {
        this.traySlide = undefined;
        this.resize();
      },
    });
  }

  cancelInteraction() {
    if (this.gesture?.kind === 'piece') this.tray.returnPiece(this.gesture.entry);
    this.returnRejectedPiece();
    this.clearLiftShadow();
    this.gesture = undefined;
    this.pinch = undefined;
    this.scene.input.setDefaultCursor('default');
  }

  private fitBoard() {
    this.board.fit();
    this.updateFitButton();
  }

  private updateFitButton() {
    const visible = this.completionStage !== 'revealing' && this.board.isViewAdjusted;
    if (this.fitButton.visible !== visible) this.fitButton.setVisible(visible);
  }

  private layoutBoard(bounds: Phaser.Geom.Rectangle) {
    this.board.layout(bounds);
    const x = Math.max(bounds.x, bounds.right - this.fitButton.width - headerControlGap);
    this.fitButton.setPosition(x, bounds.top + headerControlGap);
    this.updateFitButton();
  }

  private readonly startGesture = (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
    if (this.completionStage === 'revealing' || this.pinch) return;
    if (!pointer.wasTouch) {
      const gesture = this.gesture;
      const rightClick = pointer.button === 2;
      const leftClick = pointer.button === 0;
      if (gesture?.kind === 'piece' && gesture.pointerId === pointer.id
        && (rightClick || (leftClick && gesture.dropOn === 'click'))) {
        this.finishGesture(pointer, gesture);
        return;
      }
      if (rightClick) {
        this.pickUpOnRightClick(pointer);
        return;
      }
    }
    if (!pointer.primaryDown || (!pointer.wasTouch && pointer.button !== 0) || over.includes(this.fitButton)) return;
    if (pointer.wasTouch && this.gesture?.kind === 'piece' && this.gesture.dropOn === 'click') {
      this.cancelInteraction();
    }
    const current = this.gesture;
    if (current) {
      if (current.kind === 'tray-press' && current.pointerId !== pointer.id) current.canTap = false;
      if (current.kind === 'pan' && current.pointer.wasTouch && pointer.wasTouch
        && pointer.id !== current.pointerId && this.board.contains(pointer)) {
        this.pinch = { fingers: [current.pointer, pointer], ...measurePinch(current.pointer, pointer) };
      }
      return;
    }
    const entry = this.tray.pieceAt(pointer);
    const pointerId = pointer.id;
    if (entry && this.puzzle.canDrag(entry.piece.id)) {
      if (pointer.wasTouch || this.puzzle.pieceRotation) {
        this.gesture = {
          kind: 'tray-press', pointerId, entry, start: { x: pointer.x, y: pointer.y }, canTap: this.puzzle.pieceRotation,
        };
      } else {
        this.startPieceDrag(pointer, entry, pointer);
      }
    } else if (this.board.contains(pointer)) {
      this.gesture = { kind: 'pan', pointerId, pointer, previous: { x: pointer.x, y: pointer.y } };
    } else if (this.tray.canScrollFrom(pointer)) {
      this.gesture = { kind: 'scroll', pointerId, previous: { x: pointer.x, y: pointer.y } };
    }
    if (this.gesture && !pointer.wasTouch) this.scene.input.setDefaultCursor('grabbing');
  };

  private pickUpOnRightClick(pointer: Phaser.Input.Pointer) {
    if (this.gesture) return;
    const entry = this.tray.pieceAt(pointer);
    if (!entry || !this.puzzle.canDrag(entry.piece.id)) return;
    this.startPieceDrag(pointer, entry, pointer, 'click');
    this.scene.input.setDefaultCursor('grabbing');
  }

  private startPieceDrag(pointer: Phaser.Input.Pointer, entry: PuzzlePieceView, grab: Point, dropOn: DropTrigger = 'release') {
    this.returnRejectedPiece();
    const scale = this.board.zoom / this.tray.pieceScale;
    const offset = { x: (entry.position.x - grab.x) * scale, y: (entry.position.y - grab.y) * scale };
    this.gesture = { kind: 'piece', pointerId: pointer.id, entry, offset, dropOn };
    this.tray.lift(entry);
    entry.setScale(this.board.zoom);
    const { target, outline } = entry.piece;
    this.liftShadow = drawEffectImage(this.scene, outline.frame, 10, target, (context) => {
      context.beginPath();
      traceEffectPath(context, outline.points);
      context.closePath();
      context.fillStyle = '#10171a';
      context.shadowColor = '#10171a';
      context.shadowBlur = 5 * effectImageResolution;
      context.fill();
    }).setAlpha(0.3).setRotation(entry.rotation);
    this.floatingPieces.add(this.liftShadow);
    entry.addTo(this.floatingPieces);
    this.moveDraggedPiece(entry, pointer, offset);
  }

  private moveDraggedPiece(entry: PuzzlePieceView, pointer: Point, offset: Point) {
    const x = pointer.x + offset.x;
    const y = pointer.y + offset.y;
    entry.moveTo(x, y);
    this.liftShadow?.setPosition(x + 2, y + 4).setScale(this.board.zoom / effectImageResolution);
  }

  private clearLiftShadow() {
    this.liftShadow?.destroy();
    this.liftShadow = undefined;
  }

  private readonly handleWheel = (pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], dx: number, dy: number) => {
    if (this.completionStage === 'revealing') return;
    if (this.trayBounds.contains(pointer.x, pointer.y)) {
      if (this.gesture?.kind === 'tray-press') this.gesture.canTap = false;
      const delta = trayScrollAxis(this.side) === 'x' ? dx || dy : dy;
      this.tray.scrollBy(-0.75 * delta);
      return;
    }
    if (!dy || this.pinch || !this.board.contains(pointer)) return;
    const { deltaMode } = pointer.event as WheelEvent;
    const pixelsPerUnit = deltaMode === WheelEvent.DOM_DELTA_PAGE ? this.board.camera.height
      : deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    const previousZoom = this.board.zoom;
    this.board.zoomAt(pointer, 1.5 ** (-dy * pixelsPerUnit / 200));
    this.updateFitButton();

    const gesture = this.gesture;
    if (gesture?.kind === 'piece' && gesture.pointerId === pointer.id) {
      gesture.entry.setScale(this.board.zoom);
      const scale = this.board.zoom / previousZoom;
      gesture.offset = { x: gesture.offset.x * scale, y: gesture.offset.y * scale };
      this.moveGesture(pointer);
    }
  };

  private readonly moveGesture = (pointer: Phaser.Input.Pointer) => {
    const pinch = this.pinch;
    if (pinch) {
      if (pinch.fingers.includes(pointer)) {
        const next = measurePinch(...pinch.fingers);
        this.board.zoomAt(next.center, next.span / pinch.span, pinch.center);
        this.updateFitButton();
        Object.assign(pinch, next);
      }
      return;
    }
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointer.id) return;
    if (gesture.kind === 'tray-press') {
      this.moveTrayPress(pointer, gesture);
    } else if (gesture.kind === 'piece') {
      this.moveDraggedPiece(gesture.entry, pointer, gesture.offset);
    } else {
      const dx = pointer.x - gesture.previous.x;
      const dy = pointer.y - gesture.previous.y;
      if (gesture.kind === 'pan') {
        this.board.pan(dx, dy);
        this.updateFitButton();
      } else {
        this.tray.scrollBy(trayScrollAxis(this.side) === 'y' ? dy : dx);
      }
      gesture.previous = { x: pointer.x, y: pointer.y };
    }
  };

  private moveTrayPress(pointer: Phaser.Input.Pointer, press: Extract<Gesture, { kind: 'tray-press' }>) {
    const dx = pointer.x - press.start.x;
    const dy = pointer.y - press.start.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= tapSlop) press.canTap = false;

    if (!pointer.wasTouch) {
      if (distance >= pieceDragThreshold) this.startPieceDrag(pointer, press.entry, press.start);
      return;
    }

    const verticalTray = trayScrollAxis(this.side) === 'y';
    const alongTray = verticalTray ? dy : dx;
    const towardBoard = (verticalTray ? dx : dy) * boardDirection[this.side];
    if (towardBoard > 0 && Math.abs(alongTray) <= towardBoard * pieceDragSlope) {
      if (distance >= pieceDragThreshold) this.startPieceDrag(pointer, press.entry, press.start);
    } else if (Math.abs(alongTray) >= trayScrollThreshold) {
      this.gesture = { kind: 'scroll', pointerId: pointer.id, previous: { x: pointer.x, y: pointer.y } };
      this.tray.scrollBy(alongTray);
    }
  }

  private readonly endGesture = (pointer: Phaser.Input.Pointer) => {
    if (this.ignoresRelease(pointer)) return;
    if (pointer.wasCanceled) {
      this.cancelGesture(pointer);
      return;
    }
    if (this.endPinch(pointer)) return;
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointer.id) return;
    this.finishGesture(pointer, gesture);
  };

  private finishGesture(pointer: Phaser.Input.Pointer, gesture: Gesture) {
    if (gesture.kind !== 'tray-press') this.moveGesture(pointer);
    this.gesture = undefined;
    this.scene.input.setDefaultCursor('default');
    if (gesture.kind === 'tray-press') {
      if (gesture.canTap && Math.hypot(pointer.x - gesture.start.x, pointer.y - gesture.start.y) < tapSlop
        && this.tray.pieceAt(pointer) === gesture.entry) this.turnTrayPiece(gesture.entry);
      return;
    }
    if (gesture.kind !== 'piece') return;

    this.clearLiftShadow();
    this.dropPiece(gesture.entry, pointer);
  }

  private turnTrayPiece(entry: PuzzlePieceView) {
    const { id } = entry.piece;
    if (!this.puzzle.turnPiece(id)) return;
    entry.setOrientation(this.puzzle.orientationOf(id));
    this.tray.refreshVisibility(entry);
    this.actions.onTurn();
  }

  private dropPiece(entry: PuzzlePieceView, pointer: Point) {
    const { piece } = entry;
    const result = this.board.contains(pointer)
      ? this.puzzle.drop(piece.id, this.board.toLocal(entry.position)) : 'missed';
    if (result === 'disconnected-from-seed') {
      this.previewSeedRejection(entry);
      return;
    }
    if (result !== 'placed') {
      this.tray.returnPiece(entry);
      return;
    }

    this.board.addPieces([piece]);
    entry.setVisible(false);
    this.tray.remove(entry, this.trayBounds);
    this.updateTrayAvailability();
    this.actions.onPlacement();
    this.placementEffects.play(piece, this.puzzle.joinedSeams(piece));
  }

  private previewSeedRejection(entry: PuzzlePieceView) {
    const { piece } = entry;
    this.rejectedPiece = entry;
    entry.addTo(this.board.layer);
    entry.setScale(1);
    entry.moveTo(piece.target.x, piece.target.y);

    const feedback = this.seedDropFeedback ??= new SeedDropFeedback(this.scene, this.board.layer, this.floatingPieces);
    feedback.layout(this.scene.scale.gameSize);
    feedback.show(piece, () => this.returnRejectedPiece());
  }

  private returnRejectedPiece() {
    if (!this.rejectedPiece) return;
    this.seedDropFeedback?.clearPreview();
    this.tray.returnPiece(this.rejectedPiece);
    this.rejectedPiece = undefined;
  }

  private updateTrayAvailability() {
    for (const entry of this.pieces) {
      const { id } = entry.piece;
      if (!this.puzzle.isPlaced(id)) entry.setGrayscale(!this.puzzle.canDrag(id));
    }
  }

  private readonly cancelGesture = (pointer: Phaser.Input.Pointer) => {
    if (this.ignoresRelease(pointer)) return;
    if (this.endPinch(pointer)) return;
    if (this.gesture?.pointerId !== pointer.id) return;
    this.cancelInteraction();
  };

  private ignoresRelease(pointer: Phaser.Input.Pointer): boolean {
    const gesture = this.gesture;
    return !pointer.wasTouch && (pointer.button !== 0 || (gesture?.kind === 'piece' && gesture.dropOn === 'click'));
  }

  private endPinch(pointer: Phaser.Input.Pointer): boolean {
    const pinch = this.pinch;
    if (!pinch?.fingers.includes(pointer)) return false;
    this.pinch = undefined;
    const other = pinch.fingers.find((finger) => finger !== pointer && finger.isDown);
    this.gesture = other && {
      kind: 'pan', pointerId: other.id, pointer: other, previous: { x: other.x, y: other.y },
    };
    return true;
  }
}
