import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { getPieceCount } from '../domain/puzzleSizes';
import { gameSave } from '../persistence';
import { pickerPreviewSizes, type PickerPreviewSize, type PuzzleProgress } from '../persistence/GameSave';
import { puzzleSources } from '../puzzles/catalog';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButton, makeOptionTile, type UIScene } from './button';
import type { PuzzleSelection } from './PlayPuzzleScene';
import { cardScrollbarSpace, cardScrollThreshold, makePuzzleCardPanel } from './puzzleCardPanel';
import { artworkCreditLines, showPuzzleDetails } from './puzzleDetailsDialog';
import { showPuzzleFilters } from './puzzleFilterDialog';
import { activeFilterCount, matchesPuzzleFilters, noPuzzleFilters, samePuzzleFilters, type PuzzleFilters } from './puzzleFilters';
import { headerControlGap, headerInset, makeBackButton, makeFiltersButton, makeSettingsButton, puzzleSpacing } from './puzzleHeader';
import { makePreviewCornerCutout, makePuzzlePickerCard, maxPickerCardWidth } from './PuzzlePickerCard';
import { showPuzzleOptions, showResumePuzzle } from './puzzleOptions';
import { openSettings } from './SettingsScene';
import { metadataTextStyle, styleWithTheme } from './theme';

const previewSizes = {
  Compact: { maxWidth: 200, widthFraction: 0.465, iconGridSize: 2 },
  Full: { maxWidth: maxPickerCardWidth, widthFraction: 1, iconGridSize: 1 },
} as const;

function drawPreviewSizeIcon(scene: UIScene, size: PickerPreviewSize) {
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
  private scrollOffset = 0;

  constructor() {
    super(SelectPuzzleScene.key);
  }

  init({ filters }: { filters?: PuzzleFilters } = {}) {
    if (!filters) return;
    this.filters = filters;
    this.scrollOffset = 0;
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
      const status = cardStatus(progress, completions);
      const card = makePuzzlePickerCard(this, source, status, cutout, listBounds, cardScrollThreshold,
        () => openCard(source, progress), (copyPreview) => {
          if (dialogOpen) return;
          openDialog();
          showPuzzleDetails(this, source, status, copyPreview(), closeDialog);
        }, artworkCreditLines(source.attribution).length > 0);
      return { card, source, completions };
    });
    const grid = this.rexUI.add.gridSizer({
      column: 1, row: 1,
    });
    const list = this.rexUI.add.sizer({ orientation: 'y', space: { bottom: puzzleSpacing } })
      .add(grid, { align: 'center', key: 'cards' });
    const panel = makePuzzleCardPanel(this, list);
    const headerBackground = this.add.rectangle(0, 0, 1, 1).setOrigin(0);
    styleWithTheme(headerBackground, (colors) => {
      headerBackground.setFillStyle(colors.background);
    });
    const back = makeBackButton(this, () => {
      if (!dialogOpen) this.scene.start('Landing');
    }, 'Back to themes');
    const settings = makeSettingsButton(this, () => {
      if (dialogOpen) return;
      openDialog();
      openSettings(this, { onClose: closeDialog });
    });
    const filtersButton = makeFiltersButton(this, () => {
      if (dialogOpen) return;
      openDialog();
      showPuzzleFilters(this, this.filters, (filters) => {
        closeDialog();
        if (filters) applyFilters(filters);
      });
    });
    const filterBadge = this.add.text(0, 0, '', {
      ...metadataTextStyle, fontSize: '12px', fontStyle: 'bold', padding: { x: 3, y: 1 },
    }).setOrigin(1, 0);
    styleWithTheme(filterBadge, (colors) => {
      filterBadge.setColor(colors.primaryButtonText)
        .setBackgroundColor(Phaser.Display.Color.IntegerToColor(colors.primaryButton).rgba);
    });
    const previewSizeRow = this.rexUI.add.sizer({ space: { item: headerControlGap } }).setOrigin(0);
    const previewSizeTiles = pickerPreviewSizes.map((size) => {
      const tile = makeOptionTile(this, {
        name: `preview-size-${size}`, width: 70, height: filtersButton.height,
        drawIcon: () => drawPreviewSizeIcon(this, size),
        dragThreshold: cardScrollThreshold,
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
    let cardLayout: { columns: number; width: number; stackStatus: boolean; compact: boolean } | undefined;
    const updateFilterCaption = () => {
      const count = activeFilterCount(this.filters);
      filtersButton.setData('filterCount', count);
      filterBadge.setText(String(count)).setVisible(count > 0);
    };
    const updatePreviewSizeTiles = () => {
      for (const { size, tile } of previewSizeTiles) tile.setSelected(gameSave.settings.pickerPreviewSize === size);
    };
    const changePreviewSize = (size: PickerPreviewSize) => {
      if (gameSave.settings.pickerPreviewSize === size) return;
      const firstInView = panel.childOY < 0 && visibleCards.find(({ card: { container } }) =>
        container.y + container.height > listBounds.top);
      gameSave.updateSettings({ pickerPreviewSize: size });
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
      settings.layout(width);
      const filtersLeft = settings.button.x - filtersButton.width - headerControlGap;
      const sizesLeft = Math.max((width - previewSizeRow.width) / 2, back.x + back.width + headerControlGap);
      const stack = sizesLeft + previewSizeRow.width + headerControlGap > filtersLeft;
      const firstRowHeight = Math.max(back.height, previewSizeRow.height);
      const settingsTop = stack ? puzzleSpacing + firstRowHeight + headerControlGap : puzzleSpacing;
      previewSizeRow.setPosition(sizesLeft, puzzleSpacing);
      settings.button.setY(settingsTop);
      filtersButton.setPosition(filtersLeft, settingsTop);
      filterBadge.setPosition(filtersButton.x + filtersButton.width - 2, filtersButton.y + 2);
      const panelTop = settingsTop + Math.max(firstRowHeight, settings.button.height, filtersButton.height) + puzzleSpacing;
      const panelHeight = Math.max(1, height - panelTop);
      const listWidth = width - cardScrollbarSpace;
      const availableWidth = listWidth - 2 * puzzleSpacing;
      const size = gameSave.settings.pickerPreviewSize;
      const compact = size === 'Compact';
      const { maxWidth, widthFraction } = previewSizes[size];
      const cardWidth = Phaser.Math.Clamp(Math.floor(availableWidth * widthFraction), 1, maxWidth);
      const fittingColumns = Math.floor((availableWidth + puzzleSpacing) / (cardWidth + puzzleSpacing));
      const columns = Math.min(Math.max(1, fittingColumns), Math.max(1, visibleCards.length));
      const stackStatus = !compact && visibleCards.some(({ card }) => card.needsStatusRow(cardWidth));
      if (cardLayout?.columns !== columns || cardLayout.width !== cardWidth
        || cardLayout.stackStatus !== stackStatus || cardLayout.compact !== compact) {
        const rows = Math.max(1, Math.ceil(visibleCards.length / columns));
        grid.resetGrid(columns, rows, 0, 0, { column: puzzleSpacing, row: puzzleSpacing });
        for (const { card } of cards) card.container.setVisible(false);
        visibleCards.forEach(({ card }, index) => {
          card.layout(cardWidth, stackStatus, compact);
          card.container.setVisible(true);
          grid.add(card.container, { column: index % columns, row: Math.floor(index / columns) });
        });
        cardLayout = { columns, width: cardWidth, stackStatus, compact };
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
