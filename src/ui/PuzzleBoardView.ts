import Phaser from 'phaser';
import type { Point } from '../domain/geometry';
import type { Puzzle } from '../domain/Puzzle';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import type { UIScene } from './button';
import { PannableBoard } from './PannableBoard';
import { PieceTray } from './PieceTray';
import { arrangeTray, playWorkspace } from './playLayout';
import { PuzzlePieceView } from './PuzzlePieceView';

type Gesture = { pointerId: number } & (
  | { kind: 'piece'; entry: PuzzlePieceView; offset: Point }
  | { kind: 'pan'; previous: Point }
  | { kind: 'scroll'; previous: Point }
);

const dividerWidth = 10;

export class PuzzleBoardView {
  private readonly tray: PieceTray;
  private readonly board: PannableBoard;
  private readonly floatingPieces: Phaser.GameObjects.Layer;
  private readonly trayPanel: Phaser.GameObjects.Rectangle;
  private readonly pieces: PuzzlePieceView[];
  private readonly resize: () => void;
  private gesture?: Gesture;

  constructor(
    private readonly scene: UIScene,
    private readonly puzzle: Puzzle,
    capture: LivePuzzleCapture,
    private readonly onPlacement: () => void,
  ) {
    this.pieces = arrangeTray(puzzle.pieces).map((piece) => new PuzzlePieceView(scene, capture, piece));

    this.trayPanel = scene.add.rectangle(0, 0, 1, 1, 0x304841);
    const boardPanel = scene.add.rectangle(0, 0, 1, 1, 0x192e28);
    const divider = scene.rexUI.add.roundRectangle(0, 0, dividerWidth, 1, 4, 0x809b90);
    this.tray = new PieceTray(scene, this.pieces);
    this.board = new PannableBoard(scene, puzzle, capture);
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
    for (const { mask } of this.pieces) this.scene.textures.remove(mask);
  }

  private readonly startGesture = (pointer: Phaser.Input.Pointer) => {
    if (this.gesture || !pointer.primaryDown) return;
    const entry = this.tray.pieceAt(pointer);
    const pointerId = pointer.id;
    if (entry) {
      this.gesture = {
        kind: 'piece', pointerId, entry,
        offset: { x: entry.position.x - pointer.x, y: entry.position.y - pointer.y },
      };
      this.tray.lift(entry);
      entry.addTo(this.floatingPieces);
    } else if (this.board.contains(pointer)) {
      this.gesture = { kind: 'pan', pointerId, previous: { x: pointer.x, y: pointer.y } };
    } else if (this.tray.canScrollFrom(pointer)) {
      this.gesture = { kind: 'scroll', pointerId, previous: { x: pointer.x, y: pointer.y } };
    }
    if (this.gesture) this.scene.input.setDefaultCursor('grabbing');
  };

  private readonly moveGesture = (pointer: Phaser.Input.Pointer) => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointer.id) return;
    if (gesture.kind === 'piece') {
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
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== pointer.id) return;
    this.moveGesture(pointer);
    this.gesture = undefined;
    this.scene.input.setDefaultCursor('default');
    if (gesture.kind !== 'piece') return;

    const { entry } = gesture;
    if (this.board.contains(pointer) && this.puzzle.drop(entry.piece.id, this.board.toLocal(entry.position)) === 'placed') {
      const { x, y } = entry.piece.target;
      entry.moveTo(x, y);
      entry.addTo(this.board.layer);
      this.tray.remove(entry, this.trayPanel.getBounds());
      this.onPlacement();
    } else {
      this.tray.returnPiece(entry);
    }
  };

  private readonly cancelGesture = (pointer: Phaser.Input.Pointer) => {
    if (this.gesture?.pointerId !== pointer.id) return;
    if (this.gesture.kind === 'piece') this.tray.returnPiece(this.gesture.entry);
    this.gesture = undefined;
    this.scene.input.setDefaultCursor('default');
  };
}
