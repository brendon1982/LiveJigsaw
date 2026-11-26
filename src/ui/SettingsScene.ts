import Phaser from 'phaser';
import type { MissedDropMode } from '../domain/PuzzlePlay';
import { gameSave } from '../persistence';
import { trayPositions, type TrayPosition } from '../persistence/GameSave';
import { makeButtonLabel, makeOptionTile, type UIScene } from './button';
import { activePuzzleFilter, puzzleFilters, selectPuzzleFilter } from './puzzleFilter';
import { activeTheme, palette, selectTheme, styleWithTheme, themes } from './theme';

type SettingsCallbacks = {
  onClose?: () => void;
  onTrayPositionChange?: (position: TrayPosition) => void;
  onMissedDropModeChange?: (mode: MissedDropMode) => void;
};

const missedDropLabels: Record<MissedDropMode, string> = {
  'return-to-tray': 'Return to tray',
  'park-on-board': 'Park on board',
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

  create({ owner, onClose, onTrayPositionChange, onMissedDropModeChange }: { owner: UIScene } & SettingsCallbacks) {
    const close = () => this.scene.stop();
    const cover = this.add.rectangle(0, 0, 1, 1, palette.modalBackdrop, 0.72).setOrigin(0).setInteractive();
    const background = this.rexUI.add.roundRectangle(0, 0, 1, 1, 16);
    const title = this.add.text(0, 0, 'Settings', { fontFamily: 'system-ui', fontSize: '25px', fontStyle: 'bold' });
    const headingStyle = { fontFamily: 'system-ui', fontSize: '17px' };
    const themeHeading = this.add.text(0, 0, 'Color theme', headingStyle);
    const filterHeading = this.add.text(0, 0, 'Puzzle filter', headingStyle);
    const trayHeading = this.add.text(0, 0, 'Puzzle tray', headingStyle);
    const missedDropHeading = this.add.text(0, 0, 'Missed drops', headingStyle);
    const selectionUpdates: (() => void)[] = [];
    const refreshSelections = () => { for (const update of selectionUpdates) update(); };
    const choice = (label: string, width: number, select: () => void, selected: () => boolean) => {
      const tile = makeOptionTile(this, {
        label, width, height: 54,
        onClick: () => { select(); refreshSelections(); },
      });
      const update = () => tile.setSelected(selected());
      selectionUpdates.push(update);
      update();
      return tile.button;
    };
    const row = () => this.rexUI.add.sizer({ orientation: 'x', space: { item: 8 } });
    const themeChoices = row();
    for (const theme of Object.keys(themes) as (keyof typeof themes)[]) {
      themeChoices.add(choice(theme, 94, () => selectTheme(theme), () => activeTheme === theme));
    }
    const filterChoice = (filter: keyof typeof puzzleFilters, width: number) =>
      choice(puzzleFilters[filter], width, () => selectPuzzleFilter(filter), () => activePuzzleFilter === filter);
    const clearFilter = makeButtonLabel(this, 'Clear filter', 122, 54);
    this.rexUI.add.click(clearFilter).on('click', (_button: unknown, _object: unknown, pointer: Phaser.Input.Pointer) => {
      if (pointer.wasCanceled) return;
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
    const missedDropChoices = row();
    for (const mode of Object.keys(missedDropLabels) as MissedDropMode[]) {
      missedDropChoices.add(choice(missedDropLabels[mode], 145, () => {
        gameSave.updateSettings({ missedDropMode: mode });
        onMissedDropModeChange?.(mode);
      }, () => gameSave.settings.missedDropMode === mode));
    }
    const content = this.rexUI.add.sizer({ orientation: 'y', space: { item: 8 } });
    content.add(themeHeading, { align: 'left' })
      .add(themeChoices, { align: 'left', padding: { bottom: 6 } })
      .add(filterHeading, { align: 'left' })
      .add(filterChoices, { align: 'left', padding: { bottom: 6 } })
      .add(trayHeading, { align: 'left' })
      .add(trayChoices, { align: 'left', padding: { bottom: 6 } })
      .add(missedDropHeading, { align: 'left' })
      .add(missedDropChoices, { align: 'left' });
    const done = makeButtonLabel(this, 'Done', 96, 54, true);
    const dialog = this.rexUI.add.dialog({
      background, title, content, actions: [done], align: { title: 'left', actions: 'right' },
      space: { left: 20, right: 20, top: 20, bottom: 20, title: 14, content: 18 },
      click: { mode: 'release', clickInterval: 0 },
    }).layout();
    done.input!.cursor = 'pointer';
    dialog.on('action.click', (_button: unknown, _index: number, pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasCanceled) close();
    });
    styleWithTheme(dialog, (colors) => {
      cover.setFillStyle(colors.modalBackdrop, 0.72);
      background.setFillStyle(colors.surface).setStrokeStyle(1, colors.border);
      title.setColor(colors.text);
      themeHeading.setColor(colors.mutedText);
      filterHeading.setColor(colors.mutedText);
      trayHeading.setColor(colors.mutedText);
      missedDropHeading.setColor(colors.mutedText);
    });

    const fit = () => {
      const { width, height } = this.scale.gameSize;
      const scale = Math.min(1, Math.max(1, width - 24) / dialog.width, Math.max(1, height - 24) / dialog.height);
      cover.setSize(width, height);
      dialog.setPosition(width / 2, height / 2).setScale(scale);
    };
    fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, fit);
    this.input.keyboard?.on('keydown-ESC', close);
    owner.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, fit);
      this.input.keyboard?.off('keydown-ESC', close);
      owner.events.off(Phaser.Scenes.Events.SHUTDOWN, close);
      owner.input.enabled = true;
      if (owner.sys.isActive()) onClose?.();
    });
  }
}
