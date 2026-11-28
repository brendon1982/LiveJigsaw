import Phaser from 'phaser';
import { landingArtworkFor, type LandingArtwork } from '../landingArtwork/catalog';
import { puzzleSources } from '../puzzles/catalog';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { addArtworkCreditsButton, makeOptionTile, type UIScene } from './button';
import { showLandingArtworkDetails } from './landingArtworkDialog';
import { cardScrollbarSpace, cardScrollThreshold, clipCardInput, isNearCardViewport, makePuzzleCardPanel } from './puzzleCardPanel';
import { puzzleFilterGroups } from './puzzleFilterGroups';
import { activeFilterCount, matchesPuzzleFilters, noPuzzleFilters, type PuzzleFilterCategory, type PuzzleFilters } from './puzzleFilters';
import { headerControlGap, headerInset, makeBackButton, makeHomeButton, makeSettingsButton, puzzleSpacing } from './puzzleHeader';
import {
  captureImageArtwork, makePreview, makePreviewCornerCutout, maxPickerCardWidth, pickerCardCornerRadius,
} from './PuzzlePickerCard';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { openSettings } from './SettingsScene';
import { styleWithTheme } from './theme';

export type LandingPage = {
  category?: PuzzleFilterCategory;
  scrollOffset?: number;
  categoriesScrollOffset?: number;
};

const maxBrowseCardWidth = 320;
const browseCardHeight = 160;
const browseCardFontSize = '24px';
const filterCategories = Object.keys(puzzleFilterGroups) as PuzzleFilterCategory[];

function chooseBrowsePreviews(category?: PuzzleFilterCategory) {
  const previews = new Map<string, PuzzleSource>();
  if (category !== 'theme' && category !== 'artist') return previews;

  for (const { label, filters } of puzzleFilterGroups[category].options) {
    const matchingPuzzles = puzzleSources.filter((source) =>
      matchesPuzzleFilters(source, { completions: 0, hasResumableProgress: false }, filters));
    const source = matchingPuzzles[Math.floor(Math.random() * matchingPuzzles.length)];
    if (source) previews.set(label, source);
  }
  return previews;
}

export class LandingScene extends Phaser.Scene {
  static readonly key = 'Landing';
  declare rexUI: UIScene['rexUI'];

  constructor() {
    super(LandingScene.key);
  }

  create(page: LandingPage = {}) {
    const { category, scrollOffset = 0, categoriesScrollOffset } = page;
    const group = category && puzzleFilterGroups[category];
    const browsePreviews = chooseBrowsePreviews(category);
    const entries = this.browseEntries(page).map((entry) => ({
      ...entry, artwork: landingArtworkFor(entry.label, category), source: browsePreviews.get(entry.label),
    }));
    const hasArtwork = entries.some(({ artwork, source }) => artwork || source);
    const artworkCutout = hasArtwork ? makePreviewCornerCutout(this, 'all') : undefined;
    if (artworkCutout) this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.textures.remove(artworkCutout));
    const camera = this.cameras.main;
    const listBounds = new Phaser.Geom.Rectangle();
    const isInsideList = (x: number, y: number) => {
      const point = camera.getWorldPoint(x, y);
      return listBounds.contains(point.x, point.y);
    };
    let dialogOpen = false;
    const setDialogOpen = (open: boolean) => {
      dialogOpen = open;
      panel.setScrollerEnable(!open).setMouseWheelScrollerEnable(!open);
    };
    const canTapCard = (pointer: Phaser.Input.Pointer) => !dialogOpen && !pointer.wasCanceled
      && pointer.getDistance() < cardScrollThreshold
      && isInsideList(pointer.downX, pointer.downY) && isInsideList(pointer.x, pointer.y);
    const cards = entries.map(({ label, open, artwork, source }) => {
      const { button, artwork: artworkSlot, setCornerRadius } = makeOptionTile(this, {
        name: `${group ? 'value' : 'browse'}-${label}`, label, width: 1, height: browseCardHeight, fontSize: browseCardFontSize,
        useArtworkCaption: true,
        createArtwork: artwork || source ? () => this.add.image(0, 0, '__WHITE') : undefined,
        dragThreshold: cardScrollThreshold,
        onClick: (pointer) => { if (canTapCard(pointer)) open(panel.childOY); },
      });
      clipCardInput(button, listBounds);
      if (artworkSlot) button.setChildVisible(artworkSlot, false);
      const credits = artwork && addArtworkCreditsButton(
        this, button, `Artwork credits for ${label}`, browseCardFontSize, cardScrollThreshold, (pointer) => {
          if (!canTapCard(pointer)) return;
          setDialogOpen(true);
          showLandingArtworkDetails(this, label, artwork, () => setDialogOpen(false));
        });
      if (credits) {
        clipCardInput(credits, listBounds);
        button.setChildVisible(credits, false);
      }
      const drawArtwork = artworkSlot && artworkCutout && (() => {
        const preview = this.captureBrowseArtwork(artworkCutout, artwork, source);
        if (!preview) return;
        const { displayWidth, displayHeight } = artworkSlot;
        artworkSlot.texture = preview.removeFromDisplayList().texture;
        artworkSlot.setFrame(artworkSlot.texture.get().name).setDisplaySize(displayWidth, displayHeight);
        artworkSlot.once(Phaser.GameObjects.Events.DESTROY, () => preview.destroy());
        button.resetChildScaleState(artworkSlot).setChildVisible(artworkSlot, true);
        if (credits) button.setChildVisible(credits, true);
      });
      return { button, setCornerRadius, image: artwork?.image ?? source?.previewImage, drawArtwork };
    });
    const grid = this.rexUI.add.gridSizer({ column: 1, row: 1 });
    const list = this.rexUI.add.sizer({ orientation: 'y', space: { top: puzzleSpacing, bottom: puzzleSpacing } })
      .add(grid, { align: 'center' });
    const panel = makePuzzleCardPanel(this, list);
    if (group) {
      const back = makeBackButton(this, () => {
        if (!dialogOpen) this.scene.restart({ scrollOffset: categoriesScrollOffset });
      }, 'Back to filter categories');
      makeHomeButton(this, () => { if (!dialogOpen) this.scene.restart({}); })
        .setPosition(back.x + back.width + headerControlGap, back.y);
    }
    const settings = makeSettingsButton(this, () => {
      if (dialogOpen) return;
      setDialogOpen(true);
      openSettings(this, { onClose: () => setDialogOpen(false) });
    });
    const title = this.add.text(0, 0, group?.title ?? 'Live Jigsaw', {
      fontFamily: 'system-ui', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setName('browse-heading');
    styleWithTheme(title, (colors) => title.setColor(colors.text));

    const reflowGrid = (listWidth: number) => {
      const availableWidth = listWidth - 2 * headerInset;
      const cardWidth = Phaser.Math.Clamp(availableWidth, 1, maxBrowseCardWidth);
      const fittingColumns = Math.floor((availableWidth + puzzleSpacing) / (cardWidth + puzzleSpacing));
      const columns = Math.min(cards.length, Math.max(1, fittingColumns));
      const rows = Math.ceil(cards.length / columns);
      const cardHeight = artworkCutout ? cardWidth * 9 / 16 : browseCardHeight;
      const artworkCornerRadius = pickerCardCornerRadius * cardWidth / maxPickerCardWidth;
      grid.resetGrid(columns, rows, 0, 0, { column: puzzleSpacing, row: puzzleSpacing });
      cards.forEach(({ button, setCornerRadius }, index) => {
        button.setMinSize(cardWidth, cardHeight);
        if (artworkCutout) setCornerRadius(artworkCornerRadius);
        grid.add(button, { column: index % columns, row: Math.floor(index / columns) });
      });
    };
    const layout = () => {
      const { width, height } = this.scale.gameSize;
      camera.setViewport(0, 0, width, height).setOrigin(0);
      settings.layout(width);
      const titleTop = settings.button.y + settings.button.height;
      title.setFontSize(Phaser.Math.Clamp(Math.floor(width / 8), 30, 64)).setPosition(width / 2, titleTop);
      const panelTop = titleTop + title.height + puzzleSpacing;
      const panelHeight = Math.max(1, height - panelTop);
      const listWidth = width - cardScrollbarSpace;
      listBounds.setTo(0, panelTop, listWidth, panelHeight);

      reflowGrid(listWidth);
      const scrollOffset = panel.childOY;
      panel.setPosition(0, panelTop).setMinSize(width, panelHeight).layout().setChildOY(scrollOffset, true);
    };
    const requestedImages = new Set<string>();
    const loadNearbyArtwork = () => {
      let queuedImages = false;
      for (const card of cards) {
        if (!card.drawArtwork || !isNearCardViewport(card.button, listBounds, puzzleSpacing)) continue;
        const { image } = card;
        if (image && !this.textures.exists(image.key)) {
          if (requestedImages.has(image.key)) continue;
          requestedImages.add(image.key);
          this.load.image(image.key, image.url);
          queuedImages = true;
        } else {
          card.drawArtwork();
          card.drawArtwork = undefined;
        }
      }
      if (queuedImages) this.load.start();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.on(Phaser.Scenes.Events.UPDATE, loadNearbyArtwork);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout);
      this.events.off(Phaser.Scenes.Events.UPDATE, loadNearbyArtwork);
    });
    layout();
    panel.setChildOY(scrollOffset, true);
    loadNearbyArtwork();
  }

  private captureBrowseArtwork(cutout: Phaser.Textures.CanvasTexture, artwork?: LandingArtwork, source?: PuzzleSource) {
    if (artwork) return captureImageArtwork(this, artwork.image.key, cutout);
    if (source) return makePreview(this, source, cutout);
  }

  private browseEntries(page: LandingPage) {
    const { category } = page;
    const openPicker = (filters: PuzzleFilters, scrollOffset: number) => {
      const returnToBrowse: LandingPage = { ...page, scrollOffset };
      this.scene.start(SelectPuzzleScene.key, { filters, returnToBrowse });
    };
    if (category) {
      return puzzleFilterGroups[category].options.filter(({ filters }) => activeFilterCount(filters) > 0)
        .map(({ label, filters }) => ({ label, open: (scrollOffset: number) => openPicker(filters, scrollOffset) }));
    }

    const categories = filterCategories.map((category) => ({
      label: puzzleFilterGroups[category].title,
      open: (scrollOffset: number) => this.scene.restart({ category, categoriesScrollOffset: scrollOffset }),
    }));
    return [{ label: 'All', open: (scrollOffset: number) => openPicker(noPuzzleFilters, scrollOffset) }, ...categories];
  }
}