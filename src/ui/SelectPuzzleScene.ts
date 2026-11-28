import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { getPieceCount } from '../domain/puzzleSizes';
import { gameSave } from '../persistence';
import { pickerPreviewSizes, type PickerPreviewSize, type PuzzleProgress } from '../persistence/GameSave';
import { puzzleSources } from '../puzzles/catalog';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButton, makeOptionTile, type UIScene } from './button';
import type { LandingPage } from './LandingScene';
import type { PuzzleSelection } from './PlayPuzzleScene';
import { makePickerCardGrid } from './pickerCardGrid';
import { cardScrollbarSpace, cardScrollThreshold, isNearCardViewport, makePuzzleCardPanel, refreshPuzzleCardMask } from './puzzleCardPanel';
import { artworkCreditLines, showPuzzleDetails } from './puzzleDetailsDialog';
import { showPuzzleFilters } from './puzzleFilterDialog';
import { activeFilterCount, matchesPuzzleFilters, noPuzzleFilters, samePuzzleFilters, type PuzzleFilters } from './puzzleFilters';
import { headerControlGap, headerInset, makeBackButton, makeFiltersButton, makeHomeButton, makeSettingsButton, puzzleSpacing } from './puzzleHeader';
import { makePreviewCornerCutout, makePuzzlePickerCard, maxPickerCardWidth, measurePickerStatus } from './PuzzlePickerCard';
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
  private returnToBrowse?: LandingPage;
  private scrollOffset = 0;

  constructor() {
    super(SelectPuzzleScene.key);
  }

  init({ filters, returnToBrowse }: { filters?: PuzzleFilters; returnToBrowse?: LandingPage } = {}) {
    if (!filters) return;
    this.filters = filters;
    this.returnToBrowse = returnToBrowse;
    this.scrollOffset = 0;
  }

  create() {
    const listBounds = new Phaser.Geom.Rectangle();
    let dialogOpen = false;
    const setPickerScrolling = (enabled: boolean) => {
      panel?.setScrollerEnable(enabled).setMouseWheelScrollerEnable(enabled);
    };
    const closeDialog = () => {
      dialogOpen = false;
      setPickerScrolling(true);
      grid.refreshWindow();
    };
    const openDialog = () => {
      dialogOpen = true;
      setPickerScrolling(false);
    };
    const play = (selection: PuzzleSelection) => {
      this.scrollOffset = panel?.childOY ?? 0;
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
    const records = newestFirst.map((source) => {
      const completions = gameSave.completionCount(source.scene.key);
      const progress = resumableProgress(source);
      return { source, progress, completionState: { completions, hasResumableProgress: Boolean(progress) } };
    });
    const matchingRecords = (filters: PuzzleFilters) =>
      records.filter(({ source, completionState }) => matchesPuzzleFilters(source, completionState, filters));
    let results = matchingRecords(this.filters);
    const hasCredits = (index: number) => artworkCreditLines(results[index].source.attribution).length > 0;
    const grid = makePickerCardGrid(this, (index) => {
      const { source, progress, completionState: { completions } } = results[index];
      const status = cardStatus(progress, completions);
      return makePuzzlePickerCard(this, source, status, cutout, listBounds, cardScrollThreshold,
        () => openCard(source, progress), (copyPreview) => {
          if (dialogOpen) return;
          openDialog();
          showPuzzleDetails(this, source, status, copyPreview(), closeDialog);
        }, hasCredits(index));
    });
    const list = this.rexUI.add.sizer({ orientation: 'y', space: { bottom: puzzleSpacing } })
      .add(grid.content, { align: 'center', key: 'cards' });
    let panel: ReturnType<typeof makePuzzleCardPanel> | undefined;
    const headerBackground = this.add.rectangle(0, 0, 1, 1).setOrigin(0);
    styleWithTheme(headerBackground, (colors) => {
      headerBackground.setFillStyle(colors.background);
    });
    const back = makeBackButton(this, () => {
      if (!dialogOpen) this.scene.start('Landing', this.returnToBrowse ?? {});
    }, 'Back to browse');
    const home = makeHomeButton(this, () => {
      if (dialogOpen) return;
      this.returnToBrowse = undefined;
      this.scene.start('Landing', {});
    });
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
    const makeEmptyState = () => {
      const clearFilters = makeButton(this, 0, 0, 'Clear filters', (pointer) => {
        if (!dialogOpen && !pointer.wasCanceled) applyFilters(noPuzzleFilters);
      }, 140);
      const message = this.add.text(0, 0, 'No puzzles match your filters', {
        fontFamily: 'system-ui', fontSize: '18px', align: 'center',
      });
      const content = this.rexUI.add.sizer({ orientation: 'y', space: { item: 14 } })
        .setOrigin(0.5, 0)
        .add(message, { align: 'center' })
        .add(clearFilters, { align: 'center' });
      styleWithTheme(message, (colors) => message.setColor(colors.mutedText));
      return { content, message };
    };
    let emptyState: ReturnType<typeof makeEmptyState> | undefined;

    let cardLayout: { columns: number; width: number; stackStatus: boolean; compact: boolean } | undefined;
    const metadataMeasure = document.createElement('canvas').getContext('2d')!;
    metadataMeasure.font = `${metadataTextStyle.fontSize} ${metadataTextStyle.fontFamily}`;
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
      const firstInView = panel && panel.childOY < 0 ? grid.firstInView(-panel.childOY) : undefined;
      gameSave.updateSettings({ pickerPreviewSize: size });
      updatePreviewSizeTiles();
      layoutPicker(0, firstInView);
    };
    const applyFilters = (filters: PuzzleFilters) => {
      if (samePuzzleFilters(this.filters, filters)) return;
      this.filters = filters;
      grid.clear();
      results = matchingRecords(filters);
      cardLayout = undefined;
      updateFilterCaption();
      layoutPicker(0);
    };
    const layoutHeader = (width: number) => {
      settings.layout(width);
      const filtersLeft = settings.button.x - filtersButton.width - headerControlGap;
      const afterBack = back.x + back.width + headerControlGap;
      const afterHome = afterBack + home.width + headerControlGap;
      const centeredSizesLeft = (width - previewSizeRow.width) / 2;
      const singleRowSizesLeft = Math.max(centeredSizesLeft, afterHome);
      const stack = singleRowSizesLeft + previewSizeRow.width + headerControlGap > filtersLeft;
      const sizesLeft = stack ? Math.max(centeredSizesLeft, afterBack) : singleRowSizesLeft;
      const firstRowHeight = Math.max(back.height, home.height, previewSizeRow.height);
      const settingsTop = stack ? puzzleSpacing + firstRowHeight + headerControlGap : puzzleSpacing;
      const homeFitsTopRight = sizesLeft + previewSizeRow.width + headerControlGap <= settings.button.x;
      if (!stack) home.setPosition(afterBack, puzzleSpacing);
      else if (homeFitsTopRight) home.setPosition(settings.button.x, puzzleSpacing);
      else home.setPosition(back.x, settingsTop);
      previewSizeRow.setPosition(sizesLeft, puzzleSpacing);
      settings.button.setY(settingsTop);
      filtersButton.setPosition(filtersLeft, settingsTop);
      filterBadge.setPosition(filtersButton.x + filtersButton.width - 2, filtersButton.y + 2);
      return settingsTop + Math.max(firstRowHeight, settings.button.height, filtersButton.height) + puzzleSpacing;
    };

    const reflowCardGrid = (listWidth: number) => {
      const availableWidth = listWidth - 2 * puzzleSpacing;
      const size = gameSave.settings.pickerPreviewSize;
      const compact = size === 'Compact';
      const { maxWidth, widthFraction } = previewSizes[size];
      const cardWidth = Phaser.Math.Clamp(Math.floor(availableWidth * widthFraction), 1, maxWidth);
      const fittingColumns = Math.floor((availableWidth + puzzleSpacing) / (cardWidth + puzzleSpacing));
      const columns = Math.min(Math.max(1, fittingColumns), Math.max(1, results.length));
      if (cardLayout?.columns === columns && cardLayout.width === cardWidth && cardLayout.compact === compact) return;
      const stackStatus = !compact && results.some(({ source, progress, completionState: { completions } }) =>
        measurePickerStatus(source, cardStatus(progress, completions), metadataMeasure) > cardWidth);
      cardLayout = { columns, width: cardWidth, stackStatus, compact };
      grid.reflow(cardLayout, results.length, hasCredits);
    };

    const layoutResultsPanel = ({ width, height, panelTop, listWidth, offset }: {
      width: number; height: number; panelTop: number; listWidth: number; offset: number;
    }) => {
      const panelHeight = Math.max(1, height - panelTop);
      this.cameras.main.setViewport(0, 0, width, height).setOrigin(0);
      headerBackground.setDisplaySize(width, panelTop);
      listBounds.setTo(0, panelTop, listWidth, panelHeight);
      if (results.length === 0) {
        panel?.setVisible(false);
        emptyState ??= makeEmptyState();
        const messageWidth = width - 2 * headerInset;
        emptyState.message.setWordWrapWidth(Math.max(1, messageWidth), true);
        emptyState.content.setVisible(true).layout().setPosition(width / 2, panelTop + 36);
      } else {
        emptyState?.content.setVisible(false);
        panel ??= makePuzzleCardPanel(this, list);
        panel.setVisible(true).setPosition(0, panelTop).setMinSize(width, panelHeight).layout();
        panel.setChildOY(offset, true);
      }
    };

    const layoutPicker = (offset: number, anchorIndex?: number) => {
      const { width, height } = this.scale.gameSize;
      const panelTop = layoutHeader(width);
      const listWidth = width - cardScrollbarSpace;

      reflowCardGrid(listWidth);
      const nextOffset = anchorIndex === undefined ? offset : grid.offsetFor(anchorIndex);
      layoutResultsPanel({ width, height, panelTop, listWidth, offset: nextOffset });
      showCardWindow();
    };
    const showCardWindow = () => {
      if (panel && results.length && grid.showWindow(-panel.childOY, listBounds.height)) {
        refreshPuzzleCardMask(panel);
      }
    };
    const loadNearbyPreviews = () => {
      showCardWindow();
      let queuedImages = false;
      for (const card of grid.mountedCards()) {
        if (!isNearCardViewport(card.container, listBounds, puzzleSpacing)) continue;
        if (card.preparePreview()) queuedImages = true;
      }
      if (queuedImages) this.load.start();
    };
    const fitPicker = () => layoutPicker(panel?.childOY ?? 0);
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
