import Phaser from 'phaser';
import { gameSave } from '../persistence';
import { trayPositions, type TrayPosition } from '../persistence/GameSave';
import { makeButtonLabel, makeOptionTile, type UIScene } from './button';
import { activePuzzleFilter, puzzleFilters, selectPuzzleFilter } from './puzzleFilter';
import { pickerControlDepth, showPickerDialog } from './puzzleOptions';
import { makeScrollableDialogBody } from './scrollableDialogBody';
import { activeTheme, selectTheme, styleWithTheme, themes } from './theme';

type SettingsCallbacks = {
  onClose?: () => void;
  onTrayPositionChange?: (position: TrayPosition) => void;
  onAllowLoosePiecesOnBoardChange?: (allow: boolean) => void;
};

export function openSettings(owner: UIScene, callbacks: SettingsCallbacks = {}) {
  owner.input.enabled = false;
  owner.scene.launch(SettingsScene.key, { owner, ...callbacks });
  owner.scene.bringToTop(SettingsScene.key);
}

export class SettingsScene extends Phaser.Scene {
  static readonly key = 'Settings';
  declare rexUI: UIScene['rexUI'];

  constructor() {
    super(SettingsScene.key);
  }

  create({ owner, onClose, onTrayPositionChange, onAllowLoosePiecesOnBoardChange }: { owner: UIScene } & SettingsCallbacks) {
    const close = () => this.scene.stop();
    const headingStyle = { fontFamily: 'system-ui', fontSize: '17px' };
    const themeHeading = this.add.text(0, 0, 'Color theme', headingStyle);
    const filterHeading = this.add.text(0, 0, 'Puzzle filter', headingStyle);
    const trayHeading = this.add.text(0, 0, 'Puzzle tray', headingStyle);
    const loosePiecesHeading = this.add.text(0, 0, 'Allow loose pieces on board', headingStyle);
    const selectionUpdates: (() => void)[] = [];
    const refreshSelections = () => { for (const update of selectionUpdates) update(); };
    const choice = (label: string, width: number, select: () => void, selected: () => boolean) => {
      const tile = makeOptionTile(this, {
        label, width, height: 54, depth: pickerControlDepth, dragThreshold: 10,
        onClick: (pointer) => {
          if (!scroll.containsTap(pointer)) return;
          select();
          refreshSelections();
        },
      });
      const update = () => tile.setSelected(selected());
      selectionUpdates.push(update);
      update();
      return tile.button;
    };
    const row = () => this.rexUI.add.sizer({ orientation: 'x', space: { item: 8 } });
    const themeChoices = this.rexUI.add.sizer({ orientation: 'y', space: { item: 8 } });
    const themeNames = Object.keys(themes) as (keyof typeof themes)[];
    const themesPerRow = 3;
    for (let start = 0; start < themeNames.length; start += themesPerRow) {
      const choices = row();
      for (const theme of themeNames.slice(start, start + themesPerRow)) {
        choices.add(choice(theme, 70, () => selectTheme(theme), () => activeTheme === theme));
      }
      themeChoices.add(choices, { align: 'left' });
    }
    const filterChoice = (filter: keyof typeof puzzleFilters, width: number) =>
      choice(puzzleFilters[filter], width, () => selectPuzzleFilter(filter), () => activePuzzleFilter === filter);
    const clearFilter = makeButtonLabel(this, 'Clear filter', 122, 54, false, 10).setDepth(pickerControlDepth);
    this.rexUI.add.click(clearFilter, { threshold: 10 }).on('click', (_button: unknown, _object: unknown, pointer: Phaser.Input.Pointer) => {
      if (pointer.wasCanceled || !scroll.containsTap(pointer)) return;
      selectPuzzleFilter(undefined);
      refreshSelections();
    });
    clearFilter.input!.cursor = 'pointer';
    const filterChoices = this.rexUI.add.sizer({ orientation: 'y', space: { item: 8 } });
    filterChoices.add(row().add(filterChoice('grayscale', 168)).add(filterChoice('sepia', 122)))
      .add(row().add(filterChoice('faded', 168)).add(clearFilter));
    const trayChoices = this.rexUI.add.sizer({ orientation: 'y', space: { item: 8 } });
    for (const positions of [trayPositions.slice(0, 3), trayPositions.slice(3)]) {
      const choices = row();
      for (const position of positions) {
        choices.add(choice(position, 94, () => {
          gameSave.updateSettings({ trayPosition: position });
          onTrayPositionChange?.(position);
        }, () => (gameSave.settings.trayPosition ?? 'Auto') === position));
      }
      trayChoices.add(choices, { align: 'left' });
    }
    const loosePiecesChoices = row();
    for (const allow of [true, false]) {
      loosePiecesChoices.add(choice(allow ? 'Yes' : 'No', 145, () => {
        gameSave.updateSettings({ allowLoosePiecesOnBoard: allow });
        onAllowLoosePiecesOnBoardChange?.(allow);
      }, () => gameSave.settings.allowLoosePiecesOnBoard === allow));
    }
    const content = this.rexUI.add.sizer({ orientation: 'y', space: { item: 8 } });
    content.add(themeHeading, { align: 'left' })
      .add(themeChoices, { align: 'left', padding: { bottom: 6 } })
      .add(filterHeading, { align: 'left' })
      .add(filterChoices, { align: 'left', padding: { bottom: 6 } })
      .add(trayHeading, { align: 'left' })
      .add(trayChoices, { align: 'left', padding: { bottom: 6 } })
      .add(loosePiecesHeading, { align: 'left' })
      .add(loosePiecesChoices, { align: 'left' });
    for (const heading of [themeHeading, filterHeading, trayHeading, loosePiecesHeading]) {
      heading.setDepth(pickerControlDepth);
      styleWithTheme(heading, (colors) => heading.setColor(colors.mutedText));
    }
    const scroll = makeScrollableDialogBody(this, content, pickerControlDepth);
    showPickerDialog(this, 'Settings', scroll.body, [makeButtonLabel(this, 'Done', 96, 54, true)], close, {
      fitContent: scroll.fitContent,
    });
    owner.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      owner.events.off(Phaser.Scenes.Events.SHUTDOWN, close);
      owner.input.enabled = true;
      if (owner.sys.isActive()) onClose?.();
    });
  }
}
