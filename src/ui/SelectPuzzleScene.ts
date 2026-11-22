import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { availablePuzzleSizes, puzzleSizes } from '../domain/puzzleSizes';
import { puzzleSources } from '../puzzles/catalog';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButton, textColor } from './button';

const cardWidth = 560;
const cardHeight = 392;
const columnGap = 32;
const rowGap = 16;
const listPadding = 16;
const scrollbarWidth = 10;
const scrollbarGap = 14;
const scrollbarSpace = scrollbarWidth + scrollbarGap;
const scrollThreshold = 10;

export class SelectPuzzleScene extends Phaser.Scene {
  static readonly key = 'SelectPuzzle';
  declare rexUI: RexUIPlugin;

  constructor() {
    super(SelectPuzzleScene.key);
  }

  create() {
    const listBounds = new Phaser.Geom.Rectangle();
    const cards = puzzleSources.map((source) => this.makeCard(source, listBounds));
    const grid = this.rexUI.add.gridSizer({
      column: 1, row: 1, space: { top: listPadding, bottom: listPadding },
    });
    const panel = this.rexUI.add.scrollablePanel({
      panel: { child: grid, mask: { maskType: 'stencil' } },
      clampChildOY: true,
      scrollDetectionMode: 'rectBounds',
      scroller: { threshold: scrollThreshold },
      mouseWheelScroller: { focus: 2, speed: 0.75 },
      slider: {
        track: this.rexUI.add.roundRectangle(0, 0, 8, 10, 4, 0x35534b),
        thumb: this.rexUI.add.roundRectangle(0, 0, scrollbarWidth, 36, 5, 0x9cb5a7),
        adaptThumbSize: true,
        minThumbSize: 36,
        hideUnscrollableSlider: true,
      },
      space: { sliderY: scrollbarGap },
    }).setOrigin(0);

    let currentColumns = 0;
    const fitPicker = () => {
      const { width, height } = this.scale.gameSize;
      const zoom = Math.min(1, width / (cardWidth + 2 * listPadding + scrollbarSpace));
      const panelWidth = width / zoom;
      const panelHeight = height / zoom;
      const listWidth = panelWidth - scrollbarSpace;
      const fittingColumns = Math.floor((listWidth - 2 * listPadding + columnGap) / (cardWidth + columnGap));
      const columns = Math.min(Math.max(1, fittingColumns), Math.max(1, cards.length));
      const rows = Math.max(1, Math.ceil(cards.length / columns));
      if (currentColumns !== columns) {
        grid.resetGrid(columns, rows, 1, 0, { column: columnGap, row: rowGap });
        cards.forEach((card, index) => grid.add(card, { column: index % columns, row: Math.floor(index / columns) }));
        currentColumns = columns;
      }

      this.cameras.main.setViewport(0, 0, width, height).setOrigin(0).setZoom(zoom);
      listBounds.setTo(0, 0, listWidth, panelHeight);
      const offset = panel.childOY;
      panel.setMinSize(panelWidth, panelHeight).layout().setChildOY(offset, true);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, fitPicker);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, fitPicker));
    fitPicker();
  }

  private makeCard(source: PuzzleSource, listBounds: Phaser.Geom.Rectangle) {
    const background = this.rexUI.add.roundRectangle(0, 0, cardWidth, cardHeight, 16, 0x30453f).setOrigin(0);
    const title = this.add.text(24, 333, source.title, {
      fontFamily: 'system-ui', fontSize: '23px', color: textColor,
    });
    const buttons = availablePuzzleSizes(source.maxViewport).map((size, index) =>
      makeButton(this, 228 + index * 158, 324, `${size.label} · ${size.columns * size.rows}`, (pointer) => {
        const camera = this.cameras.main;
        const start = camera.getWorldPoint(pointer.downX, pointer.downY);
        const end = camera.getWorldPoint(pointer.x, pointer.y);
        if (pointer.wasCanceled || pointer.getDistance() >= scrollThreshold
          || !listBounds.contains(start.x, start.y) || !listBounds.contains(end.x, end.y)) return;
        this.scene.start('PlayPuzzle', { source, size });
      }, 150, scrollThreshold));
    return this.rexUI.add.container(0, 0, cardWidth, cardHeight).setOrigin(0)
      .addLocal([background, this.makePreview(source), title, ...buttons]);
  }

  private makePreview(source: PuzzleSource) {
    const { width, height } = puzzleSizes[0];
    const scale = Math.min(1, source.maxViewport.width / width, source.maxViewport.height / height);
    const objects = source.drawPreview(this, { width: width * scale, height: height * scale });
    const artwork = this.add.container(0, 0, objects).setScale(1 / scale);
    // Render once into a bounded texture so graphics cannot paint outside the preview.
    const preview = this.add.renderTexture(24, 24, width, height).setOrigin(0);
    preview.draw(artwork).render();
    artwork.destroy();
    return preview;
  }
}
