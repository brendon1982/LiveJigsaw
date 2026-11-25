import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { availablePuzzleSizes, puzzleSizes } from '../domain/puzzleSizes';
import { gameSave } from '../persistence';
import { puzzleSources } from '../puzzles/catalog';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { addPressFeedback, makeButton } from './button';
import type { PuzzleSelection } from './PlayPuzzleScene';
import { showPuzzleFilters } from './puzzleFilterDialog';
import { activeFilterCount, matchesPuzzleFilters, noPuzzleFilters, samePuzzleFilters, type PuzzleFilters } from './puzzleFilters';
import { headerControlGap, headerGap, headerInset, makeSettingsButton, puzzleHeader } from './puzzleHeader';
import { showPuzzleOptions, showResumePuzzle } from './puzzleOptions';
import { openSettings } from './SettingsScene';
import { palette, styleWithTheme } from './theme';

const cardWidth = 560;
const cardHeight = 387;
const columnGap = 32;
const rowGap = 16;
const listPadding = headerGap;
const scrollbarWidth = 10;
const scrollbarGap = 14;
const scrollbarSpace = scrollbarWidth + scrollbarGap;
const scrollThreshold = 10;

export class SelectPuzzleScene extends Phaser.Scene {
  static readonly key = 'SelectPuzzle';
  declare rexUI: RexUIPlugin;
  private filters = noPuzzleFilters;
  private scrollOffset = 0;

  constructor() {
    super(SelectPuzzleScene.key);
  }

  preload() {
    for (const source of puzzleSources) source.preloadPreview?.(this);
  }

  create() {
    const listBounds = new Phaser.Geom.Rectangle();
    let dialogOpen = false;
    const setPickerScrolling = (enabled: boolean) => {
      panel.setScrollerEnable(enabled).setMouseWheelScrollerEnable(enabled);
    };
    const closeDialog = () => {
      dialogOpen = false;
      setPickerScrolling(true);
    };
    const openDialog = () => {
      dialogOpen = true;
      setPickerScrolling(false);
    };
    const play = (selection: PuzzleSelection) => {
      this.scrollOffset = panel.childOY;
      this.scene.start('PlayPuzzle', selection);
    };
    const openSetup = (source: PuzzleSource) => {
      openDialog();
      showPuzzleOptions(this, source, gameSave.recentOptions, (size, connectorStyle, animationSpeed) => {
        const [seed] = crypto.getRandomValues(new Uint32Array(1));
        gameSave.startAttempt(source.scene.key, { sizeLabel: size.label, connectorStyle, animationSpeed });
        play({ source, setup: { size, connectorStyle, animationSpeed, seed } });
      }, closeDialog);
    };
    const openCard = (source: PuzzleSource) => {
      if (dialogOpen) return;
      const progress = gameSave.getProgress(source.scene.key);
      if (!progress || progress.setup.size.width > source.maxViewport.width
        || progress.setup.size.height > source.maxViewport.height) {
        openSetup(source);
        return;
      }

      const { columns, rows } = progress.setup.size;
      openDialog();
      showResumePuzzle(this, source, progress.placedPieceIds.length, columns * rows, (choice) => {
        closeDialog();
        if (choice === 'resume') play({ source, ...progress });
        if (choice === 'reset') openSetup(source);
      });
    };
    const cards = puzzleSources.map((source) => {
      const completions = gameSave.completionCount(source.scene.key);
      const card = this.makeCard(source, completions, listBounds, () => openCard(source));
      return { card, tags: source.tags, completions };
    });
    const grid = this.rexUI.add.gridSizer({
      column: 1, row: 1,
    });
    const list = this.rexUI.add.sizer({ orientation: 'y', space: { top: listPadding, bottom: listPadding } })
      .add(grid, { align: 'center' });
    const track = this.rexUI.add.roundRectangle(0, 0, 8, 10, 4);
    const thumb = this.rexUI.add.roundRectangle(0, 0, scrollbarWidth, 36, 5);
    const panel = this.rexUI.add.scrollablePanel({
      panel: { child: list, mask: { maskType: 'stencil' } },
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
      if (dialogOpen) return;
      openDialog();
      openSettings(this, { onClose: closeDialog });
    });
    const filtersButton = makeButton(this, 0, 0, 'Filters', (pointer) => {
      if (dialogOpen || pointer.wasCanceled) return;
      openDialog();
      showPuzzleFilters(this, this.filters, (filters) => {
        closeDialog();
        if (filters) applyFilters(filters);
      });
    }, 130);
    const clearFilters = makeButton(this, 0, 0, 'Clear filters', (pointer) => {
      if (!dialogOpen && !pointer.wasCanceled) applyFilters(noPuzzleFilters);
    }, 140);
    const emptyMessage = this.add.text(0, 0, 'No puzzles match your filters', {
      fontFamily: 'system-ui', fontSize: '18px', align: 'center',
    });
    const emptyState = this.rexUI.add.sizer({ orientation: 'y', space: { item: 14 } })
      .setOrigin(0.5, 0)
      .add(emptyMessage, { align: 'center' })
      .add(clearFilters, { align: 'center' });
    styleWithTheme(emptyMessage, (colors) => {
      emptyMessage.setColor(colors.mutedText);
    });

    const matchingCards = (filters: PuzzleFilters) =>
      cards.filter(({ tags, completions }) => matchesPuzzleFilters(tags, completions, filters));
    let visibleCards = matchingCards(this.filters);
    let currentColumns = 0;
    const updateFilterCaption = () => {
      const count = activeFilterCount(this.filters);
      filtersButton.setText(count ? `Filters (${count})` : 'Filters').layout();
    };
    const applyFilters = (filters: PuzzleFilters) => {
      if (samePuzzleFilters(this.filters, filters)) return;
      this.filters = filters;
      visibleCards = matchingCards(filters);
      currentColumns = 0;
      updateFilterCaption();
      layoutPicker(0);
    };
    const layoutPicker = (offset: number) => {
      const { width, height } = this.scale.gameSize;
      const zoom = Math.min(1, width / (cardWidth + 2 * listPadding + scrollbarSpace));
      const header = puzzleHeader(width);
      const stacked = width < 560;
      const headerHeight = stacked ? 110 : header.height;
      const panelTop = headerHeight / zoom;
      const panelWidth = width / zoom;
      const panelHeight = Math.max(1, (height - headerHeight) / zoom);
      const listWidth = panelWidth - scrollbarSpace;
      const fittingColumns = Math.floor((listWidth - 2 * listPadding + columnGap) / (cardWidth + columnGap));
      const columns = Math.min(Math.max(1, fittingColumns), Math.max(1, visibleCards.length));
      const rows = Math.max(1, Math.ceil(visibleCards.length / columns));
      if (currentColumns !== columns) {
        grid.resetGrid(columns, rows, 0, 0, { column: columnGap, row: rowGap });
        for (const { card } of cards) card.setVisible(false);
        visibleCards.forEach(({ card }, index) => {
          card.setVisible(true);
          grid.add(card, { column: index % columns, row: Math.floor(index / columns) });
        });
        currentColumns = columns;
      }

      this.cameras.main.setViewport(0, 0, width, height).setOrigin(0).setZoom(zoom);
      headerBackground.setDisplaySize(panelWidth, panelTop);
      title.setFontSize(stacked ? 20 : 34).setScale(1 / zoom)
        .setPosition(headerInset / zoom, (stacked ? 87 : header.buttonY + settings.button.height / 2) / zoom);
      settings.layout(width, zoom);
      filtersButton.setScale(1 / zoom)
        .setPosition(settings.button.x - (filtersButton.width + headerControlGap) / zoom, settings.button.y);
      listBounds.setTo(0, panelTop, listWidth, panelHeight);
      panel.setPosition(0, panelTop).setMinSize(panelWidth, panelHeight).layout().setChildOY(offset, true);
      const empty = visibleCards.length === 0;
      panel.setVisible(!empty);
      emptyState.setVisible(empty);
      if (empty) {
        const messageWidth = width - 2 * headerInset;
        emptyMessage.setWordWrapWidth(Math.max(1, messageWidth), true);
        emptyState.setScale(1).layout().setScale(1 / zoom)
          .setPosition(panelWidth / 2, panelTop + 36 / zoom);
      }
    };
    const fitPicker = () => layoutPicker(panel.childOY);
    this.scale.on(Phaser.Scale.Events.RESIZE, fitPicker);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, fitPicker);
    });
    updateFilterCaption();
    layoutPicker(this.scrollOffset);
  }

  private makeCard(source: PuzzleSource, completionCount: number, listBounds: Phaser.Geom.Rectangle, openOptions: () => void) {
    const background = this.rexUI.add.roundRectangle(0, 0, cardWidth, cardHeight, 16).setOrigin(0);
    const title = this.add.text(24, 323, source.title, {
      fontFamily: 'system-ui', fontSize: '23px',
    });
    const tags = this.add.text(24, cardHeight - 16, `${source.tags.theme} · ${source.tags.type}`, {
      fontFamily: 'system-ui', fontSize: '17px',
    }).setOrigin(0, 1);
    const completions = this.add.text(cardWidth - 24, cardHeight - 16, `Completed ${completionCount} times`, {
      fontFamily: 'system-ui', fontSize: '17px',
    }).setOrigin(1, 1);
    let pressed = false;
    const restyle = (colors: typeof palette) => {
      background.setFillStyle(pressed ? colors.surfacePressed : colors.surface);
      title.setColor(colors.text);
      tags.setColor(colors.mutedText);
      completions.setColor(colors.mutedText);
    };
    styleWithTheme(background, restyle);
    if (availablePuzzleSizes(source.maxViewport).length > 0) {
      addPressFeedback(background, (value) => { pressed = value; restyle(palette); }, scrollThreshold, (pointer) => {
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        return listBounds.contains(point.x, point.y);
      });
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
      .addLocal([background, this.makePreview(source), title, tags, completions]);
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
