import type Phaser from 'phaser';
import { makeButtonLabel, makeOptionTile, type UIScene } from './button';
import { noPuzzleFilters, puzzleFilterGroups, type PuzzleFilters } from './puzzleFilters';
import { pickerControlDepth, showPickerDialog } from './puzzleOptions';
import { makeScrollableDialogBody } from './scrollableDialogBody';
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
  const content = scene.rexUI.add.sizer({ orientation: 'y', width: contentWidth, space: { item: 10 } });

  const addSection = <T extends string>(
    { title, choices }: { title: string; choices: readonly T[] },
    widths: readonly number[],
    isSelected: (choice: T) => boolean,
    select: (choice: T) => void,
  ) => {
    content.add(scene.add.text(0, 0, title, {
      fontFamily: 'system-ui', fontSize: '17px', color: palette.mutedText,
    }).setDepth(pickerControlDepth), { align: 'left' });
    for (let start = 0; start < choices.length; start += widths.length) {
      const row = scene.rexUI.add.sizer({ orientation: 'x', space: { item: gap } });
      choices.slice(start, start + widths.length).forEach((choice, column) => {
        const tile = makeOptionTile(scene, {
          label: choice, width: widths[column], fontSize: '14px', depth: pickerControlDepth, dragThreshold: 10,
          onClick: (pointer) => {
            if (!scroll.containsTap(pointer)) return;
            select(choice);
            refreshButtons.forEach((refresh) => refresh());
          },
        });
        refreshButtons.push(() => tile.setSelected(isSelected(choice)));
        row.add(tile.button);
      });
      content.add(row, { align: 'left' });
    }
  };
  addSection(puzzleFilterGroups.theme, [100, 100, 100], (tag) => draft.themes.includes(tag), (tag) => {
    draft = { ...draft, themes: toggleChoice(draft.themes, tag) };
  });
  addSection(puzzleFilterGroups.type, [120, 90, 104], (tag) => draft.types.includes(tag), (tag) => {
    draft = { ...draft, types: toggleChoice(draft.types, tag) };
  });
  addSection(puzzleFilterGroups.completion, [50, 94, 156], (status) => draft.completion === status, (status) => {
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
    fitContent: scroll.fitContent,
    handleAction: (action) => {
      if (action !== 0) return false;
      draft = noPuzzleFilters;
      refreshButtons.forEach((refresh) => refresh());
      return true;
    },
  });
}
