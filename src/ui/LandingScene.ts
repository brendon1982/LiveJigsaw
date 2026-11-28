import Phaser from 'phaser';
import { puzzleSources } from '../puzzles/catalog';
import { creditedArtistName, type PuzzleSource } from '../puzzles/PuzzleSource';
import { makeOptionTile, type UIScene } from './button';
import { cardScrollbarSpace, cardScrollThreshold, makePuzzleCardPanel } from './puzzleCardPanel';
import { puzzleFilterGroups } from './puzzleFilterGroups';
import { activeFilterCount, noPuzzleFilters, type PuzzleFilterCategory, type PuzzleFilters } from './puzzleFilters';
import { headerInset, makeBackButton, makeSettingsButton, puzzleSpacing } from './puzzleHeader';
import { makePreview, makePreviewCornerCutout, maxPickerCardWidth, pickerCardCornerRadius } from './PuzzlePickerCard';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { openSettings } from './SettingsScene';
import { styleWithTheme } from './theme';

const maxBrowseCardWidth = 320;
const browseCardHeight = 160;
const filterCategories = Object.keys(puzzleFilterGroups) as PuzzleFilterCategory[];

function chooseArtistPreviews() {
  const previews = new Map<string, PuzzleSource>();
  for (const artist of puzzleFilterGroups.artist.choices) {
    const works = puzzleSources.filter(({ attribution }) => creditedArtistName(attribution) === artist);
    const source = works[Math.floor(Math.random() * works.length)];
    if (source) previews.set(artist, source);
  }
  return previews;
}

export class LandingScene extends Phaser.Scene {
  static readonly key = 'Landing';
  declare rexUI: UIScene['rexUI'];
  private artistPreviews = new Map<string, PuzzleSource>();

  constructor() {
    super(LandingScene.key);
  }

  init({ category }: { category?: PuzzleFilterCategory } = {}) {
    this.artistPreviews = category === 'artist' ? chooseArtistPreviews() : new Map();
  }

  preload() {
    for (const { previewImage } of this.artistPreviews.values()) {
      if (previewImage && !this.textures.exists(previewImage.key)) {
        this.load.image(previewImage.key, previewImage.url);
      }
    }
  }

  create({ category }: { category?: PuzzleFilterCategory } = {}) {
    const group = category && puzzleFilterGroups[category];
    const entries = this.browseEntries(category);
    const artistCutout = category === 'artist' ? makePreviewCornerCutout(this, 'all') : undefined;
    if (artistCutout) this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.textures.remove(artistCutout));
    const camera = this.cameras.main;
    const listBounds = new Phaser.Geom.Rectangle();
    const isInsideList = (x: number, y: number) => {
      const point = camera.getWorldPoint(x, y);
      return listBounds.contains(point.x, point.y);
    };
    const cards = entries.map(({ label, open }) => makeOptionTile(this, {
      name: `${group ? 'value' : 'browse'}-${label}`, label, width: 1, height: browseCardHeight, fontSize: '24px',
      createArtwork: artistCutout && (() => this.makeArtistPreview(label, artistCutout)),
      dragThreshold: cardScrollThreshold,
      onClick: (pointer) => {
        if (pointer.getDistance() >= cardScrollThreshold
          || !isInsideList(pointer.downX, pointer.downY) || !isInsideList(pointer.x, pointer.y)) return;
        open();
      },
    }));
    const grid = this.rexUI.add.gridSizer({ column: 1, row: 1 });
    const list = this.rexUI.add.sizer({ orientation: 'y', space: { top: puzzleSpacing, bottom: puzzleSpacing } })
      .add(grid, { align: 'center' });
    const panel = makePuzzleCardPanel(this, list);
    if (group) makeBackButton(this, () => this.scene.restart({}), 'Back to filter categories');
    const settings = makeSettingsButton(this, () => {
      panel.setScrollerEnable(false).setMouseWheelScrollerEnable(false);
      openSettings(this, { onClose: () => panel.setScrollerEnable(true).setMouseWheelScrollerEnable(true) });
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
      const cardHeight = category === 'artist' ? cardWidth * 9 / 16 : browseCardHeight;
      const artworkCornerRadius = pickerCardCornerRadius * cardWidth / maxPickerCardWidth;
      grid.resetGrid(columns, rows, 0, 0, { column: puzzleSpacing, row: puzzleSpacing });
      cards.forEach(({ button, setCornerRadius }, index) => {
        button.setMinSize(cardWidth, cardHeight);
        if (artistCutout) setCornerRadius(artworkCornerRadius);
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
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
    layout();
  }

  private makeArtistPreview(artist: string, cutout: Phaser.Textures.CanvasTexture) {
    const source = this.artistPreviews.get(artist);
    if (!source) return;
    const image = source.previewImage;
    if (image && !this.textures.exists(image.key)) return;

    // RexUI resizes backgrounds during layout, which would clear a RenderTexture.
    const preview = makePreview(this, source, cutout).removeFromDisplayList();
    const artwork = this.add.image(0, 0, preview.texture);
    artwork.once(Phaser.GameObjects.Events.DESTROY, () => preview.destroy());
    return artwork;
  }

  private browseEntries(category?: PuzzleFilterCategory) {
    const openPicker = (filters: PuzzleFilters) => this.scene.start(SelectPuzzleScene.key, { filters, category });
    if (category) {
      return puzzleFilterGroups[category].options.filter(({ filters }) => activeFilterCount(filters) > 0)
        .map(({ label, filters }) => ({ label, open: () => openPicker(filters) }));
    }

    const categories = filterCategories.map((category) => ({
      label: puzzleFilterGroups[category].title,
      open: () => this.scene.restart({ category }),
    }));
    return [{ label: 'All', open: () => openPicker(noPuzzleFilters) }, ...categories];
  }
}