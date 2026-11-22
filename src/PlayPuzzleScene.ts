import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { cellHeight, cellWidth, columns, pieceShape, rows, tabDepth } from './pieces';
import { PuzzleSourceScene, sceneHeight, sceneWidth } from './PuzzleSourceScene';
import type { Puzzle } from './puzzles';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { makeButton, mutedColor, textColor } from './ui';

const padding = 16;
const boardX = padding;
const boardY = 164;
const trayX = boardX + sceneWidth + 24;
const trayY = 144;
const trayCellWidth = cellWidth + 2 * tabDepth + 8;
const trayCellHeight = cellHeight + 2 * tabDepth + 8;
const trayOrder = [5, 2, 7, 0, 3, 6, 1, 4];
const textureKey = 'live-puzzle-output';
const captureScale = 2;
export const puzzleWidth = trayX + columns * trayCellWidth + padding;
export const puzzleHeight = 540;
const previewX = (puzzleWidth - sceneWidth) / 2;
const previewY = 190;
const views = [
  { key: 'puzzle', label: 'Puzzle', x: 24, width: 100 },
  { key: 'texture', label: 'Dynamic texture', x: 134, width: 170 },
  { key: 'direct', label: 'Direct Phaser', x: 314, width: 152 },
] as const;
type View = typeof views[number]['key'];

export class PlayPuzzleScene extends Phaser.Scene {
  declare rexUI: RexUIPlugin;

  constructor() {
    super('PlayPuzzle');
  }

  create(puzzleConfig: Puzzle) {
    const sourceScene = this.scene.get<PuzzleSourceScene>(puzzleConfig.sourceKey);
    const source = this.textures.addDynamicTexture(textureKey, sceneWidth * captureScale, sceneHeight * captureScale);
    if (!source) throw new Error('Could not create the puzzle render target');
    // The WebGL framebuffer is single-sampled. Render larger and filter when displaying it.
    source.camera.setOrigin(0).setZoom(captureScale);
    source.setFilter(Phaser.Textures.FilterMode.LINEAR);

    makeButton(this, 24, 22, 'All puzzles', () => this.scene.start(SelectPuzzleScene.key), 150);
    this.add.text(196, 19, puzzleConfig.title, {
      fontFamily: 'system-ui', fontSize: '34px', fontStyle: 'bold', color: textColor,
    });
    const helpStyle = { fontFamily: 'system-ui', fontSize: '16px', color: mutedColor };
    const details = this.add.text(previewX, previewY - 28, '', helpStyle).setVisible(false);
    const progress = this.add.text(490, 91, '', helpStyle);
    const puzzle = this.add.layer();
    const board = this.add.graphics();
    board.fillStyle(0x304843).fillRect(boardX, boardY, sceneWidth, sceneHeight);
    board.lineStyle(1, 0x78958b);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        board.strokeRect(boardX + column * cellWidth, boardY + row * cellHeight, cellWidth, cellHeight);
      }
    }
    const labelStyle = { fontFamily: 'system-ui', fontSize: '16px', color: '#e4efe4' };
    puzzle.add([
      board,
      this.add.text(boardX, boardY - 24, 'Puzzle board', labelStyle),
      this.add.text(trayX, boardY - 24, 'Pieces', labelStyle),
    ]);

    let placed = 0;
    const updateProgress = () => {
      progress.setText(placed === trayOrder.length
        ? 'Puzzle complete'
        : `Drag the pieces onto the board. ${placed} of ${trayOrder.length} placed.`);
    };
    updateProgress();

    const masks: string[] = [];
    const pieces: Phaser.GameObjects.Image[] = [];
    for (const [slot, index] of trayOrder.entries()) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const shape = pieceShape(column, row);
      const maskKey = `live-puzzle-mask-${index}`;
      const mask = this.textures.createCanvas(maskKey, shape.width, shape.height);
      if (!mask) throw new Error('Could not create a puzzle piece mask');
      masks.push(maskKey);

      const context = mask.context;
      context.beginPath();
      context.moveTo(shape.points[0].x, shape.points[0].y);
      for (const point of shape.points.slice(1)) context.lineTo(point.x, point.y);
      context.closePath();
      context.fillStyle = '#fff';
      context.fill();
      mask.refresh();

      const frame = `piece-${index}`;
      source.add(frame, 0, shape.left * captureScale, shape.top * captureScale, shape.width * captureScale, shape.height * captureScale);
      const trayPieceX = trayX + (slot % columns + 0.5) * trayCellWidth;
      const trayPieceY = trayY + (Math.floor(slot / columns) + 0.5) * trayCellHeight;
      const targetX = boardX + (column + 0.5) * cellWidth;
      const targetY = boardY + (row + 0.5) * cellHeight;
      const piece = this.add.image(trayPieceX, trayPieceY, textureKey, frame);
      piece.setOrigin(shape.centerX / shape.width, shape.centerY / shape.height);
      piece.setDisplaySize(shape.width, shape.height);
      piece.enableFilters().filters!.internal.addMask(maskKey);
      pieces.push(piece);
      puzzle.add(piece);
      const hitOutline = shape.points.map(({ x, y }) => ({ x: x * captureScale, y: y * captureScale }));
      piece.setInteractive(new Phaser.Geom.Polygon(hitOutline), Phaser.Geom.Polygon.Contains);
      this.input.setDraggable(piece);
      piece.on('dragstart', () => piece.setDepth(1));
      piece.on('drag', (_pointer: Phaser.Input.Pointer, x: number, y: number) => piece.setPosition(x, y));
      piece.on('dragend', () => {
        piece.setDepth(0);
        if (Phaser.Math.Distance.Between(piece.x, piece.y, targetX, targetY) <= 28) {
          piece.setPosition(targetX, targetY).disableInteractive();
          placed += 1;
          updateProgress();
        } else {
          piece.setPosition(trayPieceX, trayPieceY);
        }
      });
    }

    const texturePreview = this.add.image(previewX, previewY, textureKey, '__BASE')
      .setOrigin(0).setDisplaySize(sceneWidth, sceneHeight).setVisible(false);
    let view: View = 'puzzle';
    const refreshTexture = () => {
      if (view !== 'direct') source.clear().draw(sourceScene.children).render();
    };
    const changeView = (next: View) => {
      view = next;
      const showPuzzle = view === 'puzzle';
      const showTexture = view === 'texture';
      puzzle.setVisible(showPuzzle);
      for (const piece of pieces) piece.setVisible(showPuzzle);
      texturePreview.setVisible(showTexture);
      sourceScene.scene.setVisible(view === 'direct');
      details.setVisible(!showPuzzle).setText(showTexture
        ? '512 × 288 display · 2× render target'
        : '512 × 288 display · Scene camera');
      progress.setVisible(showPuzzle);
      for (const [key, button] of buttons) button.setSelected(key === view);
    };

    const buttons = views.map(({ key, label, x, width }) =>
      [key, makeButton(this, x, 76, label, () => changeView(key), width)] as const);
    changeView('puzzle');

    const startPreview = () => {
      sourceScene.cameras.main.setViewport(previewX, previewY, sceneWidth, sceneHeight);
      refreshTexture();
      this.game.events.on(Phaser.Core.Events.POST_STEP, refreshTexture);
    };
    sourceScene.events.once(Phaser.Scenes.Events.CREATE, startPreview);
    this.scene.launch(puzzleConfig.sourceKey);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.POST_STEP, refreshTexture);
      sourceScene.events.off(Phaser.Scenes.Events.CREATE, startPreview);
      this.scene.stop(puzzleConfig.sourceKey);
      this.textures.remove(source);
      for (const mask of masks) this.textures.remove(mask);
    });
  }
}
