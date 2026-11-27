import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { getPieceCount } from '../domain/puzzleSizes';
import { gameSave } from '../persistence';
import type { PuzzleProgress } from '../persistence/GameSave';
import { puzzleSources } from '../puzzles/catalog';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButton, makeOptionTile, type UIScene } from './button';
import type { PuzzleSelection } from './PlayPuzzleScene';
import { artworkCreditLines, showArtworkCredits } from './puzzleCreditsDialog';
import { showPuzzleFilters } from './puzzleFilterDialog';
import { activeFilterCount, matchesPuzzleFilters, noPuzzleFilters, samePuzzleFilters, type PuzzleFilters } from './puzzleFilters';
import { headerControlGap, headerInset, makeSettingsButton, puzzleSpacing } from './puzzleHeader';
import { makePreviewCornerCutout, makePuzzlePickerCard, maxPickerCardWidth } from './PuzzlePickerCard';
import { showPuzzleOptions, showResumePuzzle } from './puzzleOptions';
import { openSettings } from './SettingsScene';
import { styleWithTheme } from './theme';

const scrollbarWidth = 10;
const scrollbarGap = 14;
const scrollbarSpace = scrollbarWidth + scrollbarGap;
const scrollThreshold = 10;
const previewSizes = {
  Medium: { maxWidth: 200, widthFraction: 0.465, iconGridSize: 2 },
  Large: { maxWidth: maxPickerCardWidth, widthFraction: 1, iconGridSize: 1 },
} as const;
type PreviewSize = keyof typeof previewSizes;

function drawPreviewSizeIcon(scene: UIScene, size: PreviewSize) {
  const { iconGridSize } = previewSizes[size];
  const width = 28;
  const height = 18;
  const gap = 2;
  const cardWidth = (width + gap) / iconGridSize - gap;
  const cardHeight = (height + gap) / iconGridSize - gap;
  const art = scene.add.graphics();
  styleWithTheme(art, (colors) => {
    art.clear().fillStyle(colors.optionIconOutline);
    for (let row = 0; row < iconGridSize; row++) {
      for (let column = 0; column < iconGridSize; column++) {
        const x = column * (cardWidth + gap) - width / 2;
        const y = row * (cardHeight + gap) - height / 2;
        art.fillRect(x, y, cardWidth, cardHeight);
      }
    }
  });
  return scene.add.container(0, 0, [art]).setSize(width, height);
}

function resumableProgress(source: PuzzleSource): PuzzleProgress | undefined {
  const progress = gameSave.getProgress(source.scene.key);
  if (progress && progress.setup.size.width <= source.maxViewport.width
    && progress.setup.size.height <= source.maxViewport.height) return progress;
}

function cardStatus(progress: PuzzleProgress | undefined, completions: number): string {
  if (!progress) return completions > 0 ? 'Completed' : '';
  return `${progress.placedPieceIds.length} of ${getPieceCount(progress.setup.size)} placed`;
}

export class SelectPuzzleScene extends Phaser.Scene {
  static readonly key = 'SelectPuzzle';
  declare rexUI: RexUIPlugin;
  private filters = noPuzzleFilters;
  private previewSize: PreviewSize = 'Large';
  private scrollOffset = 0;

  constructor() {
    super(SelectPuzzleScene.key);
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
      showPuzzleOptions(this, source, gameSave.recentOptions, (size, recentOptions) => {
        const [seed] = crypto.getRandomValues(new Uint32Array(1));
        gameSave.startAttempt(source.scene.key, recentOptions);
        const { pieceCount, pieceShape, ...options } = recentOptions;
        play({ source, setup: { ...options, size, seed } });
      }, closeDialog);
    };
    const openCard = (source: PuzzleSource, progress: PuzzleProgress | undefined) => {
      if (dialogOpen) return;
      if (!progress) {
        openSetup(source);
        return;
      }

      openDialog();
      showResumePuzzle(this, source, progress, (choice) => {
        closeDialog();
        if (choice === 'resume') {
          const { setup, ...snapshot } = progress;
          play({ source, setup, snapshot });
        }
        if (choice === 'reset') openSetup(source);
      });
    };
    const cutout = makePreviewCornerCutout(this);
    const newestFirst = [...puzzleSources].reverse();
    const cards = newestFirst.map((source) => {
      const completions = gameSave.completionCount(source.scene.key);
      const progress = resumableProgress(source);
      const credits = artworkCreditLines(source.attribution);
      const openCredits = credits.length ? () => {
        if (dialogOpen) return;
        openDialog();
        showArtworkCredits(this, credits, closeDialog);
      } : undefined;
      const card = makePuzzlePickerCard(this, source, cardStatus(progress, completions), cutout, listBounds,
        scrollThreshold, () => openCard(source, progress), openCredits);
      return { card, source, completions };
    });
    const grid = this.rexUI.add.gridSizer({
      column: 1, row: 1,
    });
    const list = this.rexUI.add.sizer({ orientation: 'y', space: { bottom: puzzleSpacing } })
      .add(grid, { align: 'center', key: 'cards' });
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
    const previewSizeRow = this.rexUI.add.sizer({ space: { item: headerControlGap } }).setOrigin(0.5, 0);
    const previewSizeTiles = (Object.keys(previewSizes) as PreviewSize[]).map((size) => {
      const tile = makeOptionTile(this, {
        name: `preview-size-${size}`, width: 70, height: filtersButton.height,
        drawIcon: () => drawPreviewSizeIcon(this, size),
        dragThreshold: scrollThreshold,
        onClick: () => {
          if (!dialogOpen) changePreviewSize(size);
        },
      });
      previewSizeRow.add(tile.button);
      return { size, tile };
    });
    previewSizeRow.layout();
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
      cards.filter(({ source, completions }) => matchesPuzzleFilters(source, completions, filters));
    let visibleCards = matchingCards(this.filters);
    let cardLayout: { columns: number; width: number; stackStatus: boolean } | undefined;
    const updateFilterCaption = () => {
      const count = activeFilterCount(this.filters);
      filtersButton.setText(count ? `Filters (${count})` : 'Filters').layout();
    };
    const updatePreviewSizeTiles = () => {
      for (const { size, tile } of previewSizeTiles) tile.setSelected(this.previewSize === size);
    };
    const changePreviewSize = (size: PreviewSize) => {
      if (this.previewSize === size) return;
      const firstInView = panel.childOY < 0 && visibleCards.find(({ card: { container } }) =>
        container.y + container.height > listBounds.top);
      this.previewSize = size;
      updatePreviewSizeTiles();
      layoutPicker(0);
      if (firstInView) panel.setChildOY(listBounds.top - firstInView.card.container.y, true);
    };
    const applyFilters = (filters: PuzzleFilters) => {
      if (samePuzzleFilters(this.filters, filters)) return;
      this.filters = filters;
      visibleCards = matchingCards(filters);
      cardLayout = undefined;
      updateFilterCaption();
      layoutPicker(0);
    };
    const layoutPicker = (offset: number) => {
      const { width, height } = this.scale.gameSize;
      const stacked = width < 560;
      settings.layout(width);
      filtersButton.setPosition(settings.button.x - filtersButton.width - headerControlGap, settings.button.y);
      title.setFontSize(stacked ? 20 : 34);
      const buttonHeight = Math.max(settings.button.height, filtersButton.height);
      const rowHeight = Math.max(buttonHeight, title.height);
      const titleY = stacked ? puzzleSpacing + buttonHeight + headerControlGap + title.height / 2
        : puzzleSpacing + rowHeight / 2;
      title.setPosition(headerInset, titleY);
      const headerBottom = stacked ? titleY + title.height / 2 : puzzleSpacing + rowHeight;
      const sizeRowLeft = (width - previewSizeRow.width) / 2;
      const sizesFitInline = !stacked && title.x + title.width + headerControlGap <= sizeRowLeft
        && sizeRowLeft + previewSizeRow.width + headerControlGap <= filtersButton.x;
      const sizeRowTop = sizesFitInline ? titleY - previewSizeRow.height / 2 : headerBottom + headerControlGap;
      previewSizeRow.setPosition(width / 2, sizeRowTop);
      const panelTop = Math.max(headerBottom, sizeRowTop + previewSizeRow.height) + puzzleSpacing;
      const panelHeight = Math.max(1, height - panelTop);
      const listWidth = width - scrollbarSpace;
      const availableWidth = listWidth - 2 * puzzleSpacing;
      const { maxWidth, widthFraction } = previewSizes[this.previewSize];
      const cardWidth = Phaser.Math.Clamp(Math.floor(availableWidth * widthFraction), 1, maxWidth);
      const fittingColumns = Math.floor((availableWidth + puzzleSpacing) / (cardWidth + puzzleSpacing));
      const columns = Math.min(Math.max(1, fittingColumns), Math.max(1, visibleCards.length));
      const stackStatus = visibleCards.some(({ card }) => card.needsStatusRow(cardWidth));
      if (cardLayout?.columns !== columns || cardLayout.width !== cardWidth || cardLayout.stackStatus !== stackStatus) {
        const rows = Math.max(1, Math.ceil(visibleCards.length / columns));
        grid.resetGrid(columns, rows, 0, 0, { column: puzzleSpacing, row: puzzleSpacing });
        for (const { card } of cards) card.container.setVisible(false);
        visibleCards.forEach(({ card }, index) => {
          card.layout(cardWidth, stackStatus);
          card.container.setVisible(true);
          grid.add(card.container, { column: index % columns, row: Math.floor(index / columns) });
        });
        cardLayout = { columns, width: cardWidth, stackStatus };
      }

      this.cameras.main.setViewport(0, 0, width, height).setOrigin(0);
      headerBackground.setDisplaySize(width, panelTop);
      listBounds.setTo(0, panelTop, listWidth, panelHeight);
      panel.setPosition(0, panelTop).setMinSize(width, panelHeight).layout().setChildOY(offset, true);
      const empty = visibleCards.length === 0;
      panel.setVisible(!empty);
      emptyState.setVisible(empty);
      if (empty) {
        const messageWidth = width - 2 * headerInset;
        emptyMessage.setWordWrapWidth(Math.max(1, messageWidth), true);
        emptyState.layout().setPosition(width / 2, panelTop + 36);
      }
    };
    const loadNearbyPreviews = () => {
      let queuedImages = false;
      for (const { card } of visibleCards) {
        const { y, height } = card.container;
        const buffer = height + puzzleSpacing;
        if (y + height <= listBounds.top - buffer || y >= listBounds.bottom + buffer) continue;
        if (card.preparePreview()) queuedImages = true;
      }
      if (queuedImages) this.load.start();
    };
    const fitPicker = () => layoutPicker(panel.childOY);
    this.scale.on(Phaser.Scale.Events.RESIZE, fitPicker);
    this.events.on(Phaser.Scenes.Events.UPDATE, loadNearbyPreviews);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, fitPicker);
      this.events.off(Phaser.Scenes.Events.UPDATE, loadNearbyPreviews);
      this.textures.remove(cutout);
    });
    updateFilterCaption();
    updatePreviewSizeTiles();
    layoutPicker(this.scrollOffset);
    loadNearbyPreviews();
  }
}
