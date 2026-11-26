import Phaser from 'phaser';
import { Bounds, type Point } from '../domain/geometry';
import type { PuzzlePlay } from '../domain/PuzzlePlay';
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

type PieceSource = 'tray' | 'board';
type PieceContact = { entry: PuzzlePieceView; source: PieceSource };
type LiftedMember = { entry: PuzzlePieceView; offset: Point };

type Gesture = { pointer: Phaser.Input.Pointer } & (
  | ({ kind: 'piece-press'; start: Point; canTap: boolean } & PieceContact)
  | { kind: 'break-press'; entry: PuzzlePieceView; start: Point; canTap: boolean }
  | ({ kind: 'piece'; offset: Point; members: LiftedMember[]; dropOn: DropTrigger } & PieceContact)
  | { kind: 'pan'; previous: Point }
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
  onWorkspaceChange: () => void;
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

function drawNativeSizeIcon(art: Phaser.GameObjects.Graphics, color: number) {
  art.clear().lineStyle(2, color).beginPath();
  art.moveTo(-9, -3).lineTo(-5, -7).lineTo(-5, 7);
  art.moveTo(-9, 7).lineTo(-1, 7);
  art.moveTo(2, -4).lineTo(10, 4);
  art.moveTo(2, 4).lineTo(10, -4);
  art.strokePath();
}

function drawBreakPieceIcon(art: Phaser.GameObjects.Graphics, color: number) {
  art.clear().lineStyle(2, color).beginPath();
  art.moveTo(-11, 7).lineTo(-11, -7).lineTo(-2, -7).lineTo(0, -3)
    .lineTo(-4, 2).lineTo(-2, 7).closePath();
  art.moveTo(3, -7).lineTo(11, -7).lineTo(11, 7).lineTo(3, 7)
    .lineTo(1, 2).lineTo(5, -3).closePath();
  art.strokePath();
}

export class PuzzleBoardView {
  private readonly tray: PieceTray;
  private readonly board: PannableBoard;
  private readonly fitButton: ReturnType<typeof makeIconButton>;
  private readonly nativeSizeButton: ReturnType<typeof makeIconButton>;
  private readonly breakButton: ReturnType<typeof makeIconButton>;
  private breakArmed = false;
  private readonly placementEffects: PlacementEffects;
  private seedDropFeedback?: SeedDropFeedback;
  private readonly floatingPieces: Phaser.GameObjects.Layer;
  private readonly liftShadows = new Map<PuzzlePieceView, Phaser.GameObjects.Image>();
  private rejectedPiece?: PuzzlePieceView;
  private readonly pieces = new Map<string, PuzzlePieceView>();
  private parkedPieces: PuzzlePieceView[] = [];
  private breakSlide?: { entry: PuzzlePieceView; tween: Phaser.Tweens.Tween };
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
    private readonly play: PuzzlePlay,
    capture: LivePuzzleCapture,
    trayPieceArea: number,
    traySettings: TraySettings,
    private readonly actions: PuzzleActions,
    private allowLoosePiecesOnBoard: boolean,
  ) {
    const { puzzle } = play;
    const placedPieces = puzzle.pieces.filter(({ id }) => puzzle.isPlaced(id));
    for (const piece of puzzle.pieces) {
      if (puzzle.isPlaced(piece.id)) continue;
      const entry = new PuzzlePieceView(scene, capture, piece);
      entry.setOrientation(play.orientationOf(piece.id));
      this.pieces.set(piece.id, entry);
    }
    const trayEntries = this.trayEntries();

    this.trayPosition = traySettings.position;
    this.side = resolveTraySide(this.trayPosition, scene.scale.gameSize);
    this.tray = new PieceTray(scene, trayEntries, [...this.pieces.values()], puzzle.board.cellSize,
      trayPieceArea, trayScrollAxis(this.side), puzzle.pieceRotation);
    this.board = new PannableBoard(scene, puzzle.board.size, capture, puzzle.hidesGuide);
    this.board.addPieces(placedPieces);
    this.syncParkedPieces();
    this.fitButton = makeIconButton(scene, 'Fit board', drawFitBoardIcon, (pointer) => {
      if (pointer.wasCanceled) return;
      this.cancelActiveGesture();
      this.fitBoard();
    }).setVisible(false);
    this.nativeSizeButton = makeIconButton(scene, 'Native size (1×)', drawNativeSizeIcon, (pointer) => {
      if (pointer.wasCanceled) return;
      this.cancelActiveGesture();
      this.board.showNativeSize();
      this.updateZoomButtons();
    }).setVisible(false);
    this.breakButton = makeIconButton(scene, 'Break piece off', drawBreakPieceIcon, (pointer) => {
      if (pointer.wasCanceled || (!pointer.wasTouch && pointer.button !== 0) || this.pinch) return;
      this.cancelActiveGesture();
      this.setBreakArmed(!this.breakArmed);
    }, { dragThreshold: tapSlop, clickInterval: 0 }).setVisible(false);
    this.placementEffects = new PlacementEffects(scene, this.board.layer);
    this.floatingPieces = scene.add.layer();
    this.fitButton.addToLayer(this.floatingPieces);
    this.nativeSizeButton.addToLayer(this.floatingPieces);
    this.breakButton.addToLayer(this.floatingPieces);
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
    scene.input.keyboard?.on('keydown-ESC', this.cancelInteraction, this);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.cancelInteraction, this);
  }

  destroy() {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.resize);
    this.scene.input.off('pointerdown', this.startGesture);
    this.scene.input.off('pointermove', this.moveGesture);
    this.scene.input.off('pointerup', this.endGesture);
    this.scene.input.off('pointerupoutside', this.cancelGesture);
    this.scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.handleWheel);
    this.scene.input.keyboard?.off('keydown-ESC', this.cancelInteraction, this);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.cancelInteraction, this);
    this.scene.input.setDefaultCursor('default');
    this.traySlide?.remove();
    this.stopBreakSlide();
    this.tray.destroy();
    this.clearLiftShadows();
    this.seedDropFeedback?.destroy();
    this.placementEffects.destroy();
    this.board.destroy();
    for (const { mask } of this.pieces.values()) this.scene.textures.remove(mask);
  }

  setTrayPosition(position: TrayPosition) {
    if (this.trayPosition === position) return;
    this.trayPosition = position;
    this.resize();
  }

  setAllowLoosePiecesOnBoard(allow: boolean) {
    this.allowLoosePiecesOnBoard = allow;
  }

  showCompletion() {
    this.completionStage = 'revealing';
    this.updateBreakButton();
    this.updateZoomButtons();
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
    this.cancelActiveGesture();
    this.setBreakArmed(false);
  }

  private cancelActiveGesture() {
    const gesture = this.gesture;
    if (gesture?.kind === 'piece') this.restoreLift(gesture);
    this.returnRejectedPiece();
    this.clearLiftShadows();
    this.gesture = undefined;
    this.pinch = undefined;
    this.scene.input.setDefaultCursor('default');
  }

  private setBreakArmed(armed: boolean) {
    this.breakArmed = armed;
    this.breakButton.setData('primary', armed);
  }

  private updateBreakButton() {
    const available = this.completionStage === 'playing' && this.play.parkedGroups.some((group) => group.memberIds.length > 1);
    if (!available) this.setBreakArmed(false);
    if (this.breakButton.visible !== available) this.breakButton.setVisible(available);
    const { x, y } = this.board.camera;
    this.breakButton.setPosition(x + headerControlGap, y + headerControlGap);
  }

  private fitBoard() {
    this.board.fit();
    this.updateZoomButtons();
  }

  private updateZoomButtons() {
    const canZoom = this.completionStage !== 'revealing';
    const showFit = canZoom && !this.board.isFitted;
    const showNativeSize = canZoom && !this.board.isNativeSize;
    if (this.fitButton.visible !== showFit) this.fitButton.setVisible(showFit);
    if (this.nativeSizeButton.visible !== showNativeSize) this.nativeSizeButton.setVisible(showNativeSize);

    const { x, y, width } = this.board.camera;
    let right = x + width - headerControlGap;
    for (const button of [this.fitButton, this.nativeSizeButton]) {
      if (!button.visible) continue;
      const left = Math.max(x, right - button.width);
      button.setPosition(left, y + headerControlGap);
      right = left - headerControlGap;
    }
  }

  private layoutBoard(bounds: Phaser.Geom.Rectangle) {
    this.board.layout(bounds);
    this.updateBreakButton();
    this.updateZoomButtons();
  }

  private readonly startGesture = (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
    if (this.completionStage === 'revealing' || this.pinch) return;
    if (over.includes(this.fitButton) || over.includes(this.nativeSizeButton) || over.includes(this.breakButton)) return;
    if (!pointer.wasTouch) {
      const gesture = this.gesture;
      const rightClick = pointer.button === 2;
      const leftClick = pointer.button === 0;
      if (gesture?.kind === 'piece' && gesture.pointer === pointer
        && (rightClick || (leftClick && gesture.dropOn === 'click'))) {
        this.finishGesture(pointer, gesture);
        return;
      }
      if (rightClick) {
        if (!this.breakArmed) this.pickUpOnRightClick(pointer);
        return;
      }
    }
    if (!pointer.primaryDown || (!pointer.wasTouch && pointer.button !== 0)) return;
    if (pointer.wasTouch && this.gesture?.kind === 'piece' && this.gesture.dropOn === 'click') {
      this.cancelInteraction();
    }
    const current = this.gesture;
    if (current) {
      if ((current.kind === 'piece-press' || current.kind === 'break-press') && current.pointer !== pointer) {
        current.canTap = false;
      }
      if (current.pointer !== pointer && current.pointer.wasTouch && pointer.wasTouch
        && current.pointer.isDown && this.board.contains(current.pointer) && this.board.contains(pointer)) {
        this.cancelActiveGesture();
        this.pinch = { fingers: [current.pointer, pointer], ...measurePinch(current.pointer, pointer) };
      }
      return;
    }
    const contact = this.pieceContactAt(pointer);
    if (this.breakArmed && contact?.source === 'board') {
      this.gesture = { kind: 'break-press', pointer, entry: contact.entry, start: { x: pointer.x, y: pointer.y }, canTap: true };
      return;
    }
    if (!this.breakArmed && contact && this.play.puzzle.canDrag(contact.entry.piece.id)) {
      if (contact.source === 'board' || pointer.wasTouch || this.play.puzzle.pieceRotation) {
        this.gesture = {
          kind: 'piece-press', pointer, ...contact, start: { x: pointer.x, y: pointer.y },
          canTap: this.play.puzzle.pieceRotation,
        };
      } else {
        this.startPieceDrag(pointer, contact, pointer);
      }
    } else if (this.board.contains(pointer)) {
      this.gesture = { kind: 'pan', pointer, previous: { x: pointer.x, y: pointer.y } };
    } else if (this.tray.canScrollFrom(pointer)) {
      this.gesture = { kind: 'scroll', pointer, previous: { x: pointer.x, y: pointer.y } };
    }
    if (this.gesture && !pointer.wasTouch) this.scene.input.setDefaultCursor('grabbing');
  };

  private pickUpOnRightClick(pointer: Phaser.Input.Pointer) {
    if (this.gesture) return;
    const contact = this.pieceContactAt(pointer);
    if (!contact || !this.play.puzzle.canDrag(contact.entry.piece.id)) return;
    this.startPieceDrag(pointer, contact, pointer, 'click');
    this.scene.input.setDefaultCursor('grabbing');
  }

  private pieceContactAt(point: Point): PieceContact | undefined {
    if (this.board.contains(point)) {
      const local = this.board.toLocal(point);
      for (let index = this.parkedPieces.length - 1; index >= 0; index--) {
        const entry = this.parkedPieces[index];
        if (entry.contains(local)) return { entry, source: 'board' };
      }
    } else {
      const entry = this.tray.pieceAt(point);
      if (entry) return { entry, source: 'tray' };
    }
  }

  private startPieceDrag(pointer: Phaser.Input.Pointer, contact: PieceContact, grab: Point, dropOn: DropTrigger = 'release') {
    this.returnRejectedPiece();
    const { entry, source } = contact;
    if (this.breakSlide?.entry === entry) this.stopBreakSlide();
    const center = entry.position;
    const hand = source === 'board' ? this.board.toLocal(grab) : grab;
    const scale = source === 'board' ? 1 : this.tray.pieceScale;
    const offset = { x: (center.x - hand.x) / scale, y: (center.y - hand.y) / scale };
    const group = this.play.groupOf(entry.piece.id);
    const members = group ? group.memberIds.map((id) => {
      const member = this.pieces.get(id)!;
      return { entry: member, offset: { x: member.position.x - center.x, y: member.position.y - center.y } };
    }) : [{ entry, offset: { x: 0, y: 0 } }];
    const lifted = { kind: 'piece', pointer, entry, source, offset, members, dropOn } as const;
    this.gesture = lifted;
    if (source === 'tray') this.tray.lift(entry);
    for (const member of members) this.addLiftShadow(member.entry);
    for (const member of members) member.entry.addTo(this.floatingPieces);
    this.moveDraggedPiece(pointer, lifted);
  }

  private addLiftShadow(entry: PuzzlePieceView) {
    const { target, outline } = entry.piece;
    const shadow = drawEffectImage(this.scene, outline.frame, 10, target, (context) => {
      context.beginPath();
      traceEffectPath(context, outline.points);
      context.closePath();
      context.fillStyle = '#10171a';
      context.shadowColor = '#10171a';
      context.shadowBlur = 5 * effectImageResolution;
      context.fill();
    }).setAlpha(0.3).setRotation(entry.rotation).setName('Lift shadow');
    this.liftShadows.set(entry, shadow);
    this.floatingPieces.add(shadow);
  }

  private moveDraggedPiece(pointer: Point, gesture: Extract<Gesture, { kind: 'piece' }>) {
    const center = this.dropCenter(pointer, gesture.offset);
    for (const { entry, offset } of gesture.members) {
      const screen = this.board.toScreen({ x: center.x + offset.x, y: center.y + offset.y });
      entry.setScale(this.board.zoom);
      entry.moveTo(screen.x, screen.y);
      this.liftShadows.get(entry)?.setPosition(screen.x + 2, screen.y + 4)
        .setScale(this.board.zoom / effectImageResolution);
    }
  }

  private dropCenter(pointer: Point, offset: Point): Point {
    const local = this.board.toLocal(pointer);
    return { x: local.x + offset.x, y: local.y + offset.y };
  }

  private restoreLift({ entry, source }: PieceContact) {
    if (source === 'tray') this.tray.returnPiece(entry);
    else this.syncParkedPieces();
  }

  private clearLiftShadows() {
    for (const shadow of this.liftShadows.values()) shadow.destroy();
    this.liftShadows.clear();
  }

  private readonly handleWheel = (pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], dx: number, dy: number) => {
    if (this.completionStage === 'revealing') return;
    if (this.trayBounds.contains(pointer.x, pointer.y)) {
      if (this.gesture?.kind === 'piece-press') this.gesture.canTap = false;
      const delta = trayScrollAxis(this.side) === 'x' ? dx || dy : dy;
      this.tray.scrollBy(-0.75 * delta);
      return;
    }
    if (!dy || this.pinch || !this.board.contains(pointer)) return;
    const { deltaMode } = pointer.event as WheelEvent;
    const pixelsPerUnit = deltaMode === WheelEvent.DOM_DELTA_PAGE ? this.board.camera.height
      : deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    this.board.zoomAt(pointer, 1.5 ** (-dy * pixelsPerUnit / 200));
    this.updateZoomButtons();

    const gesture = this.gesture;
    if (gesture?.kind === 'piece' && gesture.pointer === pointer) this.moveDraggedPiece(pointer, gesture);
  };

  private readonly moveGesture = (pointer: Phaser.Input.Pointer) => {
    const pinch = this.pinch;
    if (pinch) {
      if (pinch.fingers.includes(pointer)) {
        const next = measurePinch(...pinch.fingers);
        this.board.zoomAt(next.center, next.span / pinch.span, pinch.center);
        this.updateZoomButtons();
        Object.assign(pinch, next);
      }
      return;
    }
    const gesture = this.gesture;
    if (!gesture || gesture.pointer !== pointer) return;
    if (gesture.kind === 'piece-press') {
      this.movePiecePress(pointer, gesture);
    } else if (gesture.kind === 'break-press') {
      if (Math.hypot(pointer.x - gesture.start.x, pointer.y - gesture.start.y) >= tapSlop) gesture.canTap = false;
    } else if (gesture.kind === 'piece') {
      this.moveDraggedPiece(pointer, gesture);
    } else {
      const dx = pointer.x - gesture.previous.x;
      const dy = pointer.y - gesture.previous.y;
      if (gesture.kind === 'pan') {
        this.board.pan(dx, dy);
        this.updateZoomButtons();
      } else {
        this.tray.scrollBy(trayScrollAxis(this.side) === 'y' ? dy : dx);
      }
      gesture.previous = { x: pointer.x, y: pointer.y };
    }
  };

  private movePiecePress(pointer: Phaser.Input.Pointer, press: Extract<Gesture, { kind: 'piece-press' }>) {
    const dx = pointer.x - press.start.x;
    const dy = pointer.y - press.start.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= tapSlop) press.canTap = false;

    if (press.source === 'board' || !pointer.wasTouch) {
      if (distance >= pieceDragThreshold) this.startPieceDrag(pointer, press, press.start);
      return;
    }

    const verticalTray = trayScrollAxis(this.side) === 'y';
    const alongTray = verticalTray ? dy : dx;
    const towardBoard = (verticalTray ? dx : dy) * boardDirection[this.side];
    if (towardBoard > 0 && Math.abs(alongTray) <= towardBoard * pieceDragSlope) {
      if (distance >= pieceDragThreshold) this.startPieceDrag(pointer, press, press.start);
    } else if (Math.abs(alongTray) >= trayScrollThreshold) {
      this.gesture = { kind: 'scroll', pointer, previous: { x: pointer.x, y: pointer.y } };
      this.tray.scrollBy(alongTray);
    }
  }

  private readonly endGesture = (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
    if (pointer.wasCanceled) {
      this.cancelGesture(pointer);
      return;
    }
    if (this.ignoresRelease(pointer)) return;
    if (this.endPinch(pointer)) return;
    const gesture = this.gesture;
    if (!gesture || gesture.pointer !== pointer) return;
    if (gesture.kind === 'break-press' && over.length) {
      this.cancelInteraction();
      return;
    }
    this.finishGesture(pointer, gesture);
  };

  private finishGesture(pointer: Phaser.Input.Pointer, gesture: Gesture) {
    if (gesture.kind === 'pan' || gesture.kind === 'scroll') this.moveGesture(pointer);
    this.gesture = undefined;
    this.scene.input.setDefaultCursor('default');
    if (gesture.kind === 'piece-press' || gesture.kind === 'break-press') {
      const tapped = gesture.canTap && Math.hypot(pointer.x - gesture.start.x, pointer.y - gesture.start.y) < tapSlop
        && this.pieceContactAt(pointer)?.entry === gesture.entry;
      if (gesture.kind === 'break-press') {
        if (tapped) this.breakOff(gesture.entry);
        else this.setBreakArmed(false);
      } else if (tapped) this.turnPiece(gesture);
      return;
    }
    if (gesture.kind !== 'piece') return;

    this.clearLiftShadows();
    this.dropPiece(pointer, gesture);
  }

  private breakOff(entry: PuzzlePieceView) {
    const start = { x: entry.position.x, y: entry.position.y };
    if (!this.play.breakOff(entry.piece.id)) return;
    this.setBreakArmed(false);
    this.syncParkedPieces();
    this.slideDetachedPiece(entry, start, this.play.positionOf(entry.piece.id)!);
    this.updateBreakButton();
    this.updateZoomButtons();
    this.actions.onWorkspaceChange();
  }

  private slideDetachedPiece(entry: PuzzlePieceView, start: Point, end: Point) {
    entry.moveTo(start.x, start.y);
    const tween = this.scene.tweens.addCounter({
      from: 0, to: 1, duration: 120, ease: 'Cubic.Out',
      onUpdate: (tween) => {
        const progress = tween.getValue() ?? 0;
        entry.moveTo(Phaser.Math.Linear(start.x, end.x, progress), Phaser.Math.Linear(start.y, end.y, progress));
      },
      onComplete: () => {
        entry.moveTo(end.x, end.y);
        this.breakSlide = undefined;
      },
    });
    this.breakSlide = { entry, tween };
  }

  private stopBreakSlide() {
    this.breakSlide?.tween.remove();
    this.breakSlide = undefined;
  }

  private turnPiece({ entry, source }: PieceContact) {
    const { id } = entry.piece;
    if (!this.play.turnPiece(id)) return;
    if (source === 'board') this.syncParkedPieces();
    else {
      entry.setOrientation(this.play.orientationOf(id));
      this.tray.refreshVisibility(entry);
    }
    this.updateZoomButtons();
    this.actions.onWorkspaceChange();
  }

  private dropPiece(pointer: Point, gesture: Extract<Gesture, { kind: 'piece' }>) {
    const { entry, offset } = gesture;
    if (!this.board.contains(pointer)) {
      const overTray = this.trayBounds.contains(pointer.x, pointer.y);
      if (overTray && this.play.returnToTray(entry.piece.id)) {
        this.reconcileWorkspace();
        this.actions.onWorkspaceChange();
      } else this.restoreLift(gesture);
      return;
    }

    const center = this.dropCenter(pointer, offset);
    const result = this.play.dropOnBoard(entry.piece.id, center, this.allowLoosePiecesOnBoard);
    if (result.kind === 'placed') {
      const locked = result.lockedPieceIds.map((id) => this.pieces.get(id)!);
      const pieces = locked.map((view) => view.piece);
      for (const view of locked) {
        view.setParked(false);
        view.setVisible(false);
      }
      this.board.addPieces(pieces);
      this.reconcileWorkspace();
      this.actions.onPlacement();
      if (pieces.length > 1) this.placementEffects.playGroup(pieces);
      else this.placementEffects.play(entry.piece, this.play.puzzle.joinedSeams(entry.piece));
    } else if (result.kind === 'parked' || result.kind === 'joined') {
      this.reconcileWorkspace();
      this.actions.onWorkspaceChange();
    } else if (result.kind === 'returned' && result.guideResult === 'disconnected-from-seed') {
      this.previewSeedRejection(entry, true);
      return;
    } else this.restoreLift(gesture);

    if (result.guideResult === 'disconnected-from-seed') this.previewSeedRejection(entry, false);
  }

  private previewSeedRejection(entry: PuzzlePieceView, previewReturningPiece: boolean) {
    const { piece } = entry;
    if (previewReturningPiece) {
      this.rejectedPiece = entry;
      entry.addTo(this.board.layer);
      entry.setScale(1);
      entry.moveTo(piece.target.x, piece.target.y);
    }

    const feedback = this.seedDropFeedback ??= new SeedDropFeedback(this.scene, this.board.layer, this.floatingPieces);
    feedback.layout(this.scene.scale.gameSize);
    feedback.show(piece, () => this.returnRejectedPiece());
  }

  private returnRejectedPiece() {
    this.seedDropFeedback?.clearPreview();
    if (!this.rejectedPiece) return;
    this.tray.returnPiece(this.rejectedPiece);
    this.rejectedPiece = undefined;
  }

  private trayEntries() {
    return this.play.trayPieces.map(({ id }) => {
      const entry = this.pieces.get(id)!;
      entry.setParked(false);
      entry.setOrientation(this.play.orientationOf(id));
      entry.setGrayscale(!this.play.puzzle.canDrag(id));
      return entry;
    });
  }

  private reconcileWorkspace() {
    this.tray.reconcile(this.trayEntries(), this.trayBounds);
    this.syncParkedPieces();
    this.updateBreakButton();
    this.updateZoomButtons();
  }

  private syncParkedPieces() {
    this.stopBreakSlide();
    const corners: Point[] = [];
    this.parkedPieces = this.play.parkedGroups.flatMap((group) => group.memberIds.map((id) => {
      const entry = this.pieces.get(id)!;
      const { x, y } = this.play.positionOf(id)!;
      entry.setParked(true);
      entry.addTo(this.board.layer);
      entry.setOrientation(group.quarterTurns);
      entry.setScale(1);
      entry.moveTo(x, y);
      entry.setVisible(true);
      const bounds = entry.bounds;
      corners.push({ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.bottom });
      return entry;
    }));
    this.board.setParkedBounds(corners.length ? Bounds.around(corners) : undefined);
  }

  private readonly cancelGesture = (pointer: Phaser.Input.Pointer) => {
    if (this.endPinch(pointer)) {
      if (pointer.wasCanceled) this.cancelInteraction();
      return;
    }
    if (this.gesture?.pointer !== pointer && !this.breakArmed) return;
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
      kind: 'pan', pointer: other, previous: { x: other.x, y: other.y },
    };
    return true;
  }
}
