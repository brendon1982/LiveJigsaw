import Phaser from 'phaser';
import { puzzleThemes } from '../puzzles/PuzzleTags';
import { makeOptionTile, type UIScene } from './button';
import { cardScrollbarSpace, cardScrollThreshold, makePuzzleCardPanel } from './puzzleCardPanel';
import { noPuzzleFilters } from './puzzleFilters';
import { headerInset, makeSettingsButton, puzzleSpacing } from './puzzleHeader';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { openSettings } from './SettingsScene';
import { styleWithTheme } from './theme';

const maxThemeCardWidth = 320;
const themeCardHeight = 160;

export class LandingScene extends Phaser.Scene {
  static readonly key = 'Landing';
  declare rexUI: UIScene['rexUI'];

  constructor() {
    super(LandingScene.key);
  }

  create() {
    const listBounds = new Phaser.Geom.Rectangle();
    const cards = (['All', ...puzzleThemes] as const).map((theme) => makeOptionTile(this, {
      name: `theme-${theme}`, label: theme, width: 1, height: themeCardHeight, fontSize: '24px',
      dragThreshold: cardScrollThreshold,
      onClick: (pointer) => {
        if (pointer.getDistance() >= cardScrollThreshold
          || !listBounds.contains(pointer.downX, pointer.downY) || !listBounds.contains(pointer.x, pointer.y)) return;
        const themes = theme === 'All' ? [] : [theme];
        this.scene.start(SelectPuzzleScene.key, { filters: { ...noPuzzleFilters, themes } });
      },
    }).button);
    const grid = this.rexUI.add.gridSizer({ column: 1, row: 1 });
    const list = this.rexUI.add.sizer({ orientation: 'y', space: { top: puzzleSpacing, bottom: puzzleSpacing } })
      .add(grid, { align: 'center' });
    const panel = makePuzzleCardPanel(this, list);
    const settings = makeSettingsButton(this, () => {
      panel.setScrollerEnable(false).setMouseWheelScrollerEnable(false);
      openSettings(this, { onClose: () => panel.setScrollerEnable(true).setMouseWheelScrollerEnable(true) });
    });
    const title = this.add.text(0, 0, 'Live Jigsaw', {
      fontFamily: 'system-ui', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    styleWithTheme(title, (colors) => title.setColor(colors.text));

    const layout = () => {
      const { width, height } = this.scale.gameSize;
      this.cameras.main.setViewport(0, 0, width, height).setOrigin(0);
      settings.layout(width);
      const titleTop = settings.button.y + settings.button.height;
      title.setFontSize(Phaser.Math.Clamp(Math.floor(width / 8), 30, 64)).setPosition(width / 2, titleTop);
      const panelTop = titleTop + title.height + puzzleSpacing;
      const panelHeight = Math.max(1, height - panelTop);
      const listWidth = width - cardScrollbarSpace;
      listBounds.setTo(0, panelTop, listWidth, panelHeight);

      const availableWidth = listWidth - 2 * headerInset;
      const cardWidth = Phaser.Math.Clamp(availableWidth, 1, maxThemeCardWidth);
      const columns = Math.min(cards.length, Math.max(1, Math.floor((availableWidth + puzzleSpacing) / (cardWidth + puzzleSpacing))));
      const rows = Math.ceil(cards.length / columns);
      grid.resetGrid(columns, rows, 0, 0, { column: puzzleSpacing, row: puzzleSpacing });
      cards.forEach((card, index) => {
        card.setMinSize(cardWidth, themeCardHeight);
        grid.add(card, { column: index % columns, row: Math.floor(index / columns) });
      });
      const offset = panel.childOY;
      panel.setPosition(0, panelTop).setMinSize(width, panelHeight).layout().setChildOY(offset, true);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));
    layout();
  }
}