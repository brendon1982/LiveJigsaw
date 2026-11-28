import Phaser from 'phaser';
import { makeOptionTile, type UIScene } from './button';
import { cardScrollbarSpace, cardScrollThreshold, makePuzzleCardPanel } from './puzzleCardPanel';
import { puzzleFilterGroups } from './puzzleFilterGroups';
import { activeFilterCount, noPuzzleFilters, type PuzzleFilterCategory, type PuzzleFilters } from './puzzleFilters';
import { headerInset, makeBackButton, makeSettingsButton, puzzleSpacing } from './puzzleHeader';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { openSettings } from './SettingsScene';
import { styleWithTheme } from './theme';

const maxBrowseCardWidth = 320;
const browseCardHeight = 160;
const filterCategories = Object.keys(puzzleFilterGroups) as PuzzleFilterCategory[];

export class LandingScene extends Phaser.Scene {
  static readonly key = 'Landing';
  declare rexUI: UIScene['rexUI'];

  constructor() {
    super(LandingScene.key);
  }

  create({ category }: { category?: PuzzleFilterCategory } = {}) {
    const group = category && puzzleFilterGroups[category];
    const entries = this.browseEntries(category);
    const camera = this.cameras.main;
    const listBounds = new Phaser.Geom.Rectangle();
    const isInsideList = (x: number, y: number) => {
      const point = camera.getWorldPoint(x, y);
      return listBounds.contains(point.x, point.y);
    };
    const cards = entries.map(({ label, open }) => makeOptionTile(this, {
      name: `${group ? 'value' : 'browse'}-${label}`, label, width: 1, height: browseCardHeight, fontSize: '24px',
      dragThreshold: cardScrollThreshold,
      onClick: (pointer) => {
        if (pointer.getDistance() >= cardScrollThreshold
          || !isInsideList(pointer.downX, pointer.downY) || !isInsideList(pointer.x, pointer.y)) return;
        open();
      },
    }).button);
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
      grid.resetGrid(columns, rows, 0, 0, { column: puzzleSpacing, row: puzzleSpacing });
      cards.forEach((card, index) => {
        card.setMinSize(cardWidth, browseCardHeight);
        grid.add(card, { column: index % columns, row: Math.floor(index / columns) });
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