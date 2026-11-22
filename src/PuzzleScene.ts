import Phaser from 'phaser';
import { cellHeight, cellWidth, columns, pieceShape, rows, tabDepth } from './pieces';
import { sceneHeight, sceneWidth, WindmillScene } from './WindmillScene';

const padding = 16;
const boardX = padding;
const boardY = 48;
const trayX = boardX + sceneWidth + 24;
const trayY = 32;
const trayCellWidth = cellWidth + 2 * tabDepth + 8;
const trayCellHeight = cellHeight + 2 * tabDepth + 8;
const trayOrder = [5, 2, 7, 0, 3, 6, 1, 4];
const textureKey = 'windmill-output';
const captureScale = 2;
export const puzzleWidth = trayX + columns * trayCellWidth + padding;
export const puzzleHeight = trayY + rows * trayCellHeight + padding;

export class PuzzleScene extends Phaser.Scene {
  constructor() {
    super('Puzzle');
  }

  create() {
    const game = document.querySelector<HTMLDivElement>('#game')!;
    const view = document.querySelector<HTMLSelectElement>('#render-view')!;
    const details = document.querySelector<HTMLSpanElement>('#render-details')!;
    const progress = document.querySelector<HTMLParagraphElement>('#puzzle-progress')!;
    const windmill = this.scene.get<WindmillScene>(WindmillScene.key);
    const source = this.textures.addDynamicTexture(textureKey, sceneWidth * captureScale, sceneHeight * captureScale);
    if (!source) throw new Error('Could not create the windmill render target');
    // The WebGL framebuffer is single-sampled. Render larger and filter when displaying it.
    source.camera.setOrigin(0).setZoom(captureScale);
    source.setFilter(Phaser.Textures.FilterMode.LINEAR);

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
      this.add.text(boardX, padding, 'Puzzle board', labelStyle),
      this.add.text(trayX, 8, 'Pieces', labelStyle),
    ]);

    let placed = 0;
    const updateProgress = () => {
      progress.textContent = placed === trayOrder.length
        ? 'Puzzle complete'
        : `Drag the pieces onto the board. ${placed} of ${trayOrder.length} placed.`;
    };
    updateProgress();

    const masks: string[] = [];
    for (const [slot, index] of trayOrder.entries()) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const shape = pieceShape(column, row);
      const maskKey = `windmill-piece-mask-${index}`;
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

    const texturePreview = this.add.image(0, 0, textureKey, '__BASE')
      .setOrigin(0).setDisplaySize(sceneWidth, sceneHeight).setVisible(false);
    const refreshTexture = () => {
      if (view.value !== 'direct') source.clear().draw(windmill.children).render();
    };
    const changeView = () => {
      const showPuzzle = view.value === 'puzzle';
      const showTexture = view.value === 'texture';
      puzzle.setVisible(showPuzzle);
      this.input.enabled = showPuzzle;
      texturePreview.setVisible(showTexture);
      windmill.scene.setVisible(view.value === 'direct');
      details.hidden = showPuzzle;
      progress.hidden = !showPuzzle;

      const width = showPuzzle ? puzzleWidth : sceneWidth;
      const height = showPuzzle ? puzzleHeight : sceneHeight;
      game.style.aspectRatio = `${width} / ${height}`;
      game.style.maxWidth = `${width}px`;
      this.scale.getParentBounds();
      if (this.scale.gameSize.width !== width || this.scale.gameSize.height !== height) {
        this.scale.setGameSize(width, height);
      } else {
        this.scale.refresh();
      }
    };
    const startPreview = () => {
      changeView();
      refreshTexture();
      this.game.events.on(Phaser.Core.Events.POST_STEP, refreshTexture);
      view.disabled = false;
    };
    view.value = 'puzzle';
    details.textContent = `${sceneWidth} × ${sceneHeight} px`;
    view.addEventListener('change', changeView);
    windmill.events.once(Phaser.Scenes.Events.CREATE, startPreview);
    this.scene.launch(WindmillScene.key);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.POST_STEP, refreshTexture);
      windmill.events.off(Phaser.Scenes.Events.CREATE, startPreview);
      this.scene.stop(WindmillScene.key);
      view.removeEventListener('change', changeView);
      view.disabled = true;
      this.textures.remove(source);
      for (const mask of masks) this.textures.remove(mask);
    });
  }
}
