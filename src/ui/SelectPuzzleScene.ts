import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { availablePuzzleSizes, puzzleSizes } from '../domain/puzzleSizes';
import { gameSave } from '../persistence';
import { puzzleSources } from '../puzzles/catalog';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import type { PuzzleSelection } from './PlayPuzzleScene';
import { headerInset, makeSettingsButton, puzzleHeader } from './puzzleHeader';
import { showPuzzleOptions, showResumePuzzle } from './puzzleOptions';
import { openSettings } from './SettingsScene';
import { styleWithTheme } from './theme';

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

  preload() {
    for (const source of puzzleSources) source.preloadPreview?.(this);
  }

  create() {
    const listBounds = new Phaser.Geom.Rectangle();
    let dialog: ReturnType<typeof showPuzzleOptions> | undefined;
    const setPickerScrolling = (enabled: boolean) => {
      panel.setScrollerEnable(enabled).setMouseWheelScrollerEnable(enabled);
    };
    const closeDialog = () => {
      dialog = undefined;
      setPickerScrolling(true);
    };
    const play = (selection: PuzzleSelection) => this.scene.start('PlayPuzzle', selection);
    const openSetup = (source: PuzzleSource) => {
      setPickerScrolling(false);
      dialog = showPuzzleOptions(this, source, gameSave.recentOptions, (size, connectorStyle, animationSpeed) => {
        const [seed] = crypto.getRandomValues(new Uint32Array(1));
        gameSave.startAttempt(source.scene.key, { sizeLabel: size.label, connectorStyle, animationSpeed });
        play({ source, setup: { size, connectorStyle, animationSpeed, seed } });
      }, closeDialog);
    };
    const cards = puzzleSources.map((source) => this.makeCard(source, listBounds, () => {
      if (dialog) return;
      const progress = gameSave.getProgress(source.scene.key);
      if (!progress || progress.setup.size.width > source.maxViewport.width
        || progress.setup.size.height > source.maxViewport.height) {
        openSetup(source);
        return;
      }

      const { columns, rows } = progress.setup.size;
      setPickerScrolling(false);
      dialog = showResumePuzzle(this, source, progress.placedPieceIds.length, columns * rows, (choice) => {
        closeDialog();
        if (choice === 'resume') play({ source, ...progress });
        if (choice === 'reset') openSetup(source);
      });
    }));
    const grid = this.rexUI.add.gridSizer({
      column: 1, row: 1, space: { top: listPadding, bottom: listPadding },
    });
    const track = this.rexUI.add.roundRectangle(0, 0, 8, 10, 4);
    const thumb = this.rexUI.add.roundRectangle(0, 0, scrollbarWidth, 36, 5);
    const panel = this.rexUI.add.scrollablePanel({
      panel: { child: grid, mask: { maskType: 'stencil' } },
      clampChildOY: true,
      scrollDetectionMode: 'rectBounds',
      scroller: { threshold: scrollThreshold },
      mouseWheelScroller: { focus: 2, speed: 0.75 },
      slider: {
        track, thumb,
        adaptThumbSize: true,
        minThumbSize: 36,
        hideUnscrollableSlider: true,
      },
      space: { sliderY: scrollbarGap },
    }).setOrigin(0);
    styleWithTheme(panel, (colors) => {
      track.setFillStyle(colors.scrollbarTrack);
      thumb.setFillStyle(colors.scrollbarThumb);
    });
    const headerBackground = this.add.rectangle(0, 0, 1, 1).setOrigin(0);
    const title = this.add.text(0, 0, 'Select a Puzzle', {
      fontFamily: 'system-ui', fontSize: '34px', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    styleWithTheme(headerBackground, (colors) => {
      headerBackground.setFillStyle(colors.background);
      title.setColor(colors.text);
    });
    const settings = makeSettingsButton(this, () => {
      if (dialog) return;
      setPickerScrolling(false);
      openSettings(this, () => setPickerScrolling(true));
    });

    let currentColumns = 0;
    const fitPicker = () => {
      const { width, height } = this.scale.gameSize;
      const zoom = Math.min(1, width / (cardWidth + 2 * listPadding + scrollbarSpace));
      const header = puzzleHeader(width);
      const panelTop = header.height / zoom;
      const panelWidth = width / zoom;
      const panelHeight = Math.max(1, (height - header.height) / zoom);
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
      headerBackground.setDisplaySize(panelWidth, panelTop);
      title.setFontSize(header.narrow ? 20 : 34).setScale(1 / zoom)
        .setPosition(headerInset / zoom, (header.narrow ? 87 : header.buttonY + settings.button.height / 2) / zoom);
      settings.layout(width, zoom);
      listBounds.setTo(0, panelTop, listWidth, panelHeight);
      const offset = panel.childOY;
      panel.setPosition(0, panelTop).setMinSize(panelWidth, panelHeight).layout().setChildOY(offset, true);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, fitPicker);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, fitPicker);
    });
    fitPicker();
  }

  private makeCard(source: PuzzleSource, listBounds: Phaser.Geom.Rectangle, openOptions: () => void) {
    const background = this.rexUI.add.roundRectangle(0, 0, cardWidth, cardHeight, 16).setOrigin(0);
    const title = this.add.text(24, 333, source.title, {
      fontFamily: 'system-ui', fontSize: '23px',
    });
    const completions = this.add.text(cardWidth - 24, cardHeight - 16, `Completed ${gameSave.completionCount(source.scene.key)} times`, {
      fontFamily: 'system-ui', fontSize: '17px',
    }).setOrigin(1, 1);
    styleWithTheme(background, (colors) => {
      background.setFillStyle(colors.surface);
      title.setColor(colors.text);
      completions.setColor(colors.mutedText);
    });
    if (availablePuzzleSizes(source.maxViewport).length > 0) {
      this.rexUI.add.click(background, { threshold: scrollThreshold, clickInterval: 0 })
        .on('click', (_button: unknown, _object: unknown, pointer: Phaser.Input.Pointer) => {
          const camera = this.cameras.main;
          const start = camera.getWorldPoint(pointer.downX, pointer.downY);
          const end = camera.getWorldPoint(pointer.x, pointer.y);
          if (pointer.wasCanceled || pointer.getDistance() >= scrollThreshold
            || !listBounds.contains(start.x, start.y) || !listBounds.contains(end.x, end.y)) return;
          openOptions();
        });
      background.input!.cursor = 'pointer';
    }
    return this.rexUI.add.container(0, 0, cardWidth, cardHeight).setOrigin(0)
      .addLocal([background, this.makePreview(source), title, completions]);
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
