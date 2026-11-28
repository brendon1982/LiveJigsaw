import type Phaser from 'phaser';
import { makeButtonLabel, makeOptionTile, type UIScene } from './button';
import { puzzleFilterGroups } from './puzzleFilterGroups';
import { noPuzzleFilters, type PuzzleFilters } from './puzzleFilters';
import { pickerControlDepth, showPickerDialog } from './puzzleOptions';
import { makeScrollableDialogBody, wrapDialogText } from './scrollableDialogBody';
import { palette } from './theme';

const contentWidth = 326;
const gap = 6;

function toggleChoice<T>(choices: readonly T[], choice: T): T[] {
  return choices.includes(choice) ? choices.filter((entry) => entry !== choice) : [...choices, choice];
}

export function showPuzzleFilters(
  scene: UIScene,
  filters: PuzzleFilters,
  onClose: (filters?: PuzzleFilters) => void,
) {
  let draft = filters;
  const refreshButtons: (() => void)[] = [];
  const content = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 10 } });
  const sections: { heading: Phaser.GameObjects.Text; tiles: ReturnType<UIScene['rexUI']['add']['fixWidthSizer']> }[] = [];

  const addSection = <T extends string>(
    { title, choices }: { title: string; choices: readonly T[] },
    widths: readonly number[],
    isSelected: (choice: T) => boolean,
    select: (choice: T) => void,
  ) => {
    const heading = scene.add.text(0, 0, title, {
      fontFamily: 'system-ui', fontSize: '17px', color: palette.mutedText,
    }).setDepth(pickerControlDepth);
    const tiles = scene.rexUI.add.fixWidthSizer({ space: { item: gap, line: gap } });
    choices.forEach((choice, index) => {
      const tile = makeOptionTile(scene, {
        label: choice, width: widths[index % widths.length], fontSize: '14px', depth: pickerControlDepth, dragThreshold: 10,
        onClick: (pointer) => {
          if (!scroll.containsTap(pointer)) return;
          select(choice);
          refreshButtons.forEach((refresh) => refresh());
        },
      });
      refreshButtons.push(() => tile.setSelected(isSelected(choice)));
      tiles.add(tile.button);
    });
    sections.push({ heading, tiles });
    content.add(heading, { align: 'left' }).add(tiles, { align: 'left' });
  };
  addSection(puzzleFilterGroups.theme, [100, 100, 100], (tag) => draft.themes.includes(tag), (tag) => {
    draft = { ...draft, themes: toggleChoice(draft.themes, tag) };
  });
  addSection(puzzleFilterGroups.artist, [160, 160], (artist) => draft.artists.includes(artist), (artist) => {
    draft = { ...draft, artists: toggleChoice(draft.artists, artist) };
  });
  addSection(puzzleFilterGroups.type, [120, 90, 104], (tag) => draft.types.includes(tag), (tag) => {
    draft = { ...draft, types: toggleChoice(draft.types, tag) };
  });
  addSection(puzzleFilterGroups.completion, [160, 160], (status) => draft.completion === status, (status) => {
    draft = { ...draft, completion: status };
  });
  addSection(puzzleFilterGroups.motion, [50, 94, 156], (motion) => draft.motion === motion, (motion) => {
    draft = { ...draft, motion };
  });
  refreshButtons.forEach((refresh) => refresh());

  const scroll = makeScrollableDialogBody(scene, content, pickerControlDepth);

  const actions = [
    makeButtonLabel(scene, 'Clear', 76, 52),
    makeButtonLabel(scene, 'Cancel', 88, 52),
    makeButtonLabel(scene, 'Apply', 88, 52, true),
  ];
  return showPickerDialog(scene, 'Filters', scroll.body, actions, (action) => onClose(action === 2 ? draft : undefined), {
    responsive: scroll.responsiveLayout(contentWidth + 16, (width) => {
      for (const { heading, tiles } of sections) {
        wrapDialogText(heading, width);
        tiles.setMinWidth(width);
      }
    }),
    handleAction: (action) => {
      if (action !== 0) return false;
      draft = noPuzzleFilters;
      refreshButtons.forEach((refresh) => refresh());
      return true;
    },
  });
}
