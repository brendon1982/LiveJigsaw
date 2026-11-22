import Phaser from 'phaser';
import type { Point } from '../domain/geometry';
import type { Puzzle } from '../domain/Puzzle';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import type { UIScene } from './button';
import { PannableBoard } from './PannableBoard';
import { PieceTray } from './PieceTray';
import { playWorkspace } from './playLayout';
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

const pieceDragThreshold = 8;
const pieceDragSlope = Math.tan(70 * Math.PI / 180);
const trayScrollThreshold = 20;

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
  private readonly trayPanel: Phaser.GameObjects.Rectangle;
  private readonly pieces: PuzzlePieceView[];
  private readonly resize: () => void;
  private gesture?: Gesture;
  private pinch?: Pinch;

  constructor(
    private readonly scene: UIScene,
    private readonly puzzle: Puzzle,
    capture: LivePuzzleCapture,
    private readonly onPlacement: () => void,
  ) {
    this.pieces = Phaser.Math.RND.shuffle([...puzzle.pieces])
      .map((piece) => new PuzzlePieceView(scene, capture, piece));

    this.trayPanel = scene.add.rectangle(0, 0, 1, 1, 0x304841);
    const boardPanel = scene.add.rectangle(0, 0, 1, 1, 0x192e28);
    const dividerWidth = 10;
    const divider = scene.rexUI.add.roundRectangle(0, 0, dividerWidth, 1, 4, 0x809b90);
    this.tray = new PieceTray(scene, this.pieces);
    this.board = new PannableBoard(scene, puzzle.board.size, capture);
    this.floatingPieces = scene.add.layer();
    const dragCamera = scene.cameras.add().setName('Dragged piece');
    dragCamera.inputEnabled = false;

    const split = scene.rexUI.add.splitPanels({
      leftPanel: this.trayPanel, rightPanel: boardPanel, splitter: divider,
      splitRatio: 0,
    }).setOrigin(0);
    if (divider.input) divider.input.cursor = 'ew-resize';

    const layoutPanels = () => {
      this.tray.layout(this.trayPanel.getBounds());
      this.board.layout(boardPanel.getBounds());
    };
    split.on('splitter.drag', layoutPanels);
    this.resize = () => {
      const { gameSize } = scene.scale;
      const { x, y, width, height } = playWorkspace(gameSize);
      const usableWidth = Math.max(2, width - dividerWidth);
      const minLeft = Math.min(this.tray.minimumWidth, usableWidth / 2);
      const minRight = Math.min(260, usableWidth - minLeft);
      split.setMinLeftPanelWidth(minLeft).setMinRightPanelWidth(minRight)
        .setSplitRatio(Phaser.Math.Clamp(split.splitRatio, minLeft / usableWidth, 1 - minRight / usableWidth))
        .setPosition(x, y).setMinSize(width, height).layout();
      dragCamera.setViewport(0, 0, gameSize.width, gameSize.height);
      layoutPanels();
    };
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize);
    this.resize();

    // The panel cameras clip their own layers. The drag camera draws above both panels.
    scene.cameras.main.ignore([this.tray.layer, this.board.layer, this.floatingPieces]);
    const layers = [
      [this.tray.camera, this.tray.layer],
      [this.board.camera, this.board.layer],
      [dragCamera, this.floatingPieces],
    ] as const;
    for (const [camera, layer] of layers) {
      for (const object of scene.children.getChildren()) {
        if (object !== layer) object.cameraFilter |= camera.id;
      }
    }

    scene.input.on('pointerdown', this.startGesture);
    scene.input.on('pointermove', this.moveGesture);
    scene.input.on('pointerup', this.endGesture);
    scene.input.on('pointerupoutside', this.cancelGesture);
  }

  destroy() {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.resize);
    this.scene.input.off('pointerdown', this.startGesture);
    this.scene.input.off('pointermove', this.moveGesture);
    this.scene.input.off('pointerup', this.endGesture);
    this.scene.input.off('pointerupoutside', this.cancelGesture);
    this.scene.input.setDefaultCursor('default');
    this.tray.destroy();
    this.board.destroy();
    for (const { mask } of this.pieces) this.scene.textures.remove(mask);
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
    const offset = { x: entry.position.x - grab.x, y: entry.position.y - grab.y };
    this.gesture = { kind: 'piece', pointerId: pointer.id, entry, offset };
    this.tray.lift(entry, this.board.zoom);
    entry.addTo(this.floatingPieces);
    entry.moveTo(pointer.x + offset.x, pointer.y + offset.y);
  }

  private readonly moveGesture = (pointer: Phaser.Input.Pointer) => {
    const pinch = this.pinch;
    if (pinch) {
      if (pinch.fingers.includes(pointer)) {
        const next = measurePinch(...pinch.fingers);
        this.board.pinch(pinch.center, next.center, next.span / pinch.span);
        Object.assign(pinch, next);
      }
      return;
    }
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointer.id) return;
    if (gesture.kind === 'tray-touch') {
      const dx = pointer.x - gesture.start.x;
      const dy = pointer.y - gesture.start.y;
      const distance = Math.hypot(dx, dy);
      if (dx > 0 && Math.abs(dy) <= dx * pieceDragSlope) {
        if (distance >= pieceDragThreshold) this.startPieceDrag(pointer, gesture.entry, gesture.start);
      } else if (Math.abs(dy) >= trayScrollThreshold) {
        this.gesture = { kind: 'scroll', pointerId: pointer.id, previous: { x: pointer.x, y: pointer.y } };
        this.tray.scrollBy(dy);
      }
    } else if (gesture.kind === 'piece') {
      gesture.entry.moveTo(pointer.x + gesture.offset.x, pointer.y + gesture.offset.y);
    } else {
      const dx = pointer.x - gesture.previous.x;
      const dy = pointer.y - gesture.previous.y;
      if (gesture.kind === 'pan') this.board.pan(dx, dy);
      else this.tray.scrollBy(dy);
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
      this.board.addPiece(entry.piece);
      entry.hide();
      this.tray.remove(entry, this.trayPanel.getBounds());
      this.onPlacement();
    } else {
      this.tray.returnPiece(entry);
    }
  };

  private readonly cancelGesture = (pointer: Phaser.Input.Pointer) => {
    if (this.endPinch(pointer)) return;
    if (this.gesture?.pointerId !== pointer.id) return;
    if (this.gesture.kind === 'piece') this.tray.returnPiece(this.gesture.entry);
    this.gesture = undefined;
    this.scene.input.setDefaultCursor('default');
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
