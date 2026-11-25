import Phaser from 'phaser';
import type { Point } from '../domain/geometry';
import type { Puzzle } from '../domain/Puzzle';
import type { TrayFractions, TrayPosition } from '../persistence/GameSave';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import type { UIScene } from './button';
import { PannableBoard } from './PannableBoard';
import { PieceTray } from './PieceTray';
import { playWorkspace, resolveTraySide, trayScrollAxis, type TraySide } from './playLayout';
import { PuzzlePanels } from './PuzzlePanels';
import { PuzzlePieceView } from './PuzzlePieceView';

type Gesture = { pointerId: number } & (
  | { kind: 'tray-touch'; entry: PuzzlePieceView; start: Point }
  | { kind: 'piece'; entry: PuzzlePieceView; offset: Point }
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

const pieceDragThreshold = 8;
const pieceDragSlope = Math.tan(70 * Math.PI / 180);
const trayScrollThreshold = 20;
const boardDirection: Record<TraySide, number> = { Left: 1, Right: -1, Top: 1, Bottom: -1 };

function measurePinch(a: Point, b: Point) {
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    span: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
  };
}

export class PuzzleBoardView {
  private readonly tray: PieceTray;
  private readonly board: PannableBoard;
  private readonly floatingPieces: Phaser.GameObjects.Layer;
  private readonly pieces: PuzzlePieceView[];
  private trayBounds = new Phaser.Geom.Rectangle();
  private trayPosition: TrayPosition;
  private side: TraySide;
  private panels?: PuzzlePanels;
  private readonly resize: () => void;
  private gesture?: Gesture;
  private pinch?: Pinch;

  constructor(
    private readonly scene: UIScene,
    private readonly puzzle: Puzzle,
    capture: LivePuzzleCapture,
    trayPieceSize: number,
    traySettings: TraySettings,
    private readonly onPlacement: () => void,
  ) {
    const remainingPieces = puzzle.pieces.filter(({ id }) => !puzzle.isPlaced(id));
    const placedPieces = puzzle.pieces.filter(({ id }) => puzzle.isPlaced(id));
    this.pieces = Phaser.Math.RND.shuffle(remainingPieces)
      .map((piece) => new PuzzlePieceView(scene, capture, piece));

    this.trayPosition = traySettings.position;
    this.side = resolveTraySide(this.trayPosition, scene.scale.gameSize);
    this.tray = new PieceTray(scene, this.pieces, puzzle.board.cellSize, trayPieceSize, trayScrollAxis(this.side));
    this.board = new PannableBoard(scene, puzzle.board.size, capture);
    this.board.addPieces(placedPieces);
    this.floatingPieces = scene.add.layer();
    const dragCamera = scene.cameras.add().setName('Dragged piece');
    dragCamera.inputEnabled = false;

    // The panel cameras clip their own layers. The drag camera draws above both panels.
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
          this.board.layout(boardBounds);
        }, (fraction) => {
          trayFractions = { ...trayFractions, [orientation]: fraction };
          traySettings.onResize(trayFractions);
        });
        clipLayers();
      }
      this.panels.layout(playWorkspace(gameSize), this.tray.minimumSize, trayFractions[orientation]);
      dragCamera.setViewport(0, 0, gameSize.width, gameSize.height);
    };
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize);
    this.resize();

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
    this.tray.destroy();
    this.board.destroy();
    for (const { mask } of this.pieces) this.scene.textures.remove(mask);
  }

  setTrayPosition(position: TrayPosition) {
    if (this.trayPosition === position) return;
    this.trayPosition = position;
    this.resize();
  }

  cancelInteraction() {
    if (this.gesture?.kind === 'piece') this.tray.returnPiece(this.gesture.entry);
    this.gesture = undefined;
    this.pinch = undefined;
    this.scene.input.setDefaultCursor('default');
  }

  private readonly startGesture = (pointer: Phaser.Input.Pointer) => {
    if (!pointer.primaryDown || this.pinch) return;
    const current = this.gesture;
    if (current) {
      if (current.kind === 'pan' && current.pointer.wasTouch && pointer.wasTouch
        && pointer.id !== current.pointerId && this.board.contains(pointer)) {
        this.pinch = { fingers: [current.pointer, pointer], ...measurePinch(current.pointer, pointer) };
      }
      return;
    }
    const entry = this.tray.pieceAt(pointer);
    const pointerId = pointer.id;
    if (entry) {
      if (pointer.wasTouch) {
        this.gesture = { kind: 'tray-touch', pointerId, entry, start: { x: pointer.x, y: pointer.y } };
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

  private startPieceDrag(pointer: Phaser.Input.Pointer, entry: PuzzlePieceView, grab: Point) {
    const scale = this.board.zoom / this.tray.pieceScale;
    const offset = { x: (entry.position.x - grab.x) * scale, y: (entry.position.y - grab.y) * scale };
    this.gesture = { kind: 'piece', pointerId: pointer.id, entry, offset };
    this.tray.lift(entry);
    entry.setScale(this.board.zoom);
    entry.addTo(this.floatingPieces);
    entry.moveTo(pointer.x + offset.x, pointer.y + offset.y);
  }

  private readonly handleWheel = (pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], dx: number, dy: number) => {
    if (this.trayBounds.contains(pointer.x, pointer.y)) {
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
        Object.assign(pinch, next);
      }
      return;
    }
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointer.id) return;
    if (gesture.kind === 'tray-touch') {
      const dx = pointer.x - gesture.start.x;
      const dy = pointer.y - gesture.start.y;
      const verticalTray = trayScrollAxis(this.side) === 'y';
      const alongTray = verticalTray ? dy : dx;
      const towardBoard = (verticalTray ? dx : dy) * boardDirection[this.side];
      const distance = Math.hypot(dx, dy);
      if (towardBoard > 0 && Math.abs(alongTray) <= towardBoard * pieceDragSlope) {
        if (distance >= pieceDragThreshold) this.startPieceDrag(pointer, gesture.entry, gesture.start);
      } else if (Math.abs(alongTray) >= trayScrollThreshold) {
        this.gesture = { kind: 'scroll', pointerId: pointer.id, previous: { x: pointer.x, y: pointer.y } };
        this.tray.scrollBy(alongTray);
      }
    } else if (gesture.kind === 'piece') {
      gesture.entry.moveTo(pointer.x + gesture.offset.x, pointer.y + gesture.offset.y);
    } else {
      const dx = pointer.x - gesture.previous.x;
      const dy = pointer.y - gesture.previous.y;
      if (gesture.kind === 'pan') this.board.pan(dx, dy);
      else this.tray.scrollBy(trayScrollAxis(this.side) === 'y' ? dy : dx);
      gesture.previous = { x: pointer.x, y: pointer.y };
    }
  };

  private readonly endGesture = (pointer: Phaser.Input.Pointer) => {
    if (pointer.wasCanceled) {
      this.cancelGesture(pointer);
      return;
    }
    if (this.endPinch(pointer)) return;
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointer.id) return;
    if (gesture.kind !== 'tray-touch') this.moveGesture(pointer);
    this.gesture = undefined;
    this.scene.input.setDefaultCursor('default');
    if (gesture.kind !== 'piece') return;

    const { entry } = gesture;
    if (this.board.contains(pointer) && this.puzzle.drop(entry.piece.id, this.board.toLocal(entry.position)) === 'placed') {
      this.board.addPieces([entry.piece]);
      entry.hide();
      this.tray.remove(entry, this.trayBounds);
      this.onPlacement();
    } else {
      this.tray.returnPiece(entry);
    }
  };

  private readonly cancelGesture = (pointer: Phaser.Input.Pointer) => {
    if (this.endPinch(pointer)) return;
    if (this.gesture?.pointerId !== pointer.id) return;
    this.cancelInteraction();
  };

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
