import Phaser from 'phaser';
import type { Puzzle } from '../domain/Puzzle';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import { arrangeTray, boardBounds, trayLabelX, traySlotCenter } from './playLayout';
import { createPuzzlePieceImage } from './puzzlePieceImage';

export class PuzzleBoardView {
  private readonly layer: Phaser.GameObjects.Layer;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly masks: Phaser.Textures.CanvasTexture[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly puzzle: Puzzle,
    capture: LivePuzzleCapture,
    onPlacement: () => void,
  ) {
    this.layer = scene.add.layer();
    this.drawBoard();
    for (const [slot, piece] of arrangeTray(puzzle.pieces).entries()) {
      const home = traySlotCenter(slot);
      const { image, mask } = createPuzzlePieceImage(scene, capture, piece, home);
      this.masks.push(mask);
      this.images.push(image);
      this.layer.add(image);

      image.on('dragstart', () => image.setDepth(1));
      image.on('drag', (_pointer: Phaser.Input.Pointer, x: number, y: number) => image.setPosition(x, y));
      image.on('dragend', () => {
        image.setDepth(0);
        const result = puzzle.drop(piece.id, boardBounds.toLocal(image));
        if (result === 'placed') {
          image.setPosition(boardBounds.x + piece.target.x, boardBounds.y + piece.target.y).disableInteractive();
          onPlacement();
        } else if (result === 'missed') {
          image.setPosition(home.x, home.y);
        }
      });
    }
  }

  setVisible(visible: boolean) {
    this.layer.setVisible(visible);
    // Layer visibility alone does not hide the individual input hit areas.
    for (const image of this.images) image.setVisible(visible);
  }

  releaseTextures() {
    for (const mask of this.masks) this.scene.textures.remove(mask);
  }

  private drawBoard() {
    const { x, y, width, height } = boardBounds;
    const board = this.scene.add.graphics();
    board.fillStyle(0x304843).fillRect(x, y, width, height);
    board.lineStyle(1, 0x78958b);
    for (const { bounds } of this.puzzle.board.cells) {
      board.strokeRect(x + bounds.x, y + bounds.y, bounds.width, bounds.height);
    }
    const labelStyle = { fontFamily: 'system-ui', fontSize: '16px', color: '#e4efe4' };
    this.layer.add([
      board,
      this.scene.add.text(x, y - 24, 'Puzzle board', labelStyle),
      this.scene.add.text(trayLabelX, y - 24, 'Pieces', labelStyle),
    ]);
  }
}
