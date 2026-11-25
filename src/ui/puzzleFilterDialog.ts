import type Phaser from 'phaser';
import { puzzleThemes, puzzleTypes } from '../puzzles/PuzzleTags';
import { makeButtonLabel, makeOptionTile, type UIScene } from './button';
import { completionFilters, noPuzzleFilters, type PuzzleFilters } from './puzzleFilters';
import { pickerControlDepth, showPickerDialog } from './puzzleOptions';
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
    title: string,
    choices: readonly T[],
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
            if (!isInsideBody(pointer)) return;
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
  addSection('Theme', puzzleThemes, [100, 100, 100], (tag) => draft.themes.includes(tag), (tag) => {
    draft = { ...draft, themes: toggleChoice(draft.themes, tag) };
  });
  addSection('Type', puzzleTypes, [120, 90, 104], (tag) => draft.types.includes(tag), (tag) => {
    draft = { ...draft, types: toggleChoice(draft.types, tag) };
  });
  addSection('Completion', completionFilters, [50, 94, 156], (status) => draft.completion === status, (status) => {
    draft = { ...draft, completion: status };
  });
  refreshButtons.forEach((refresh) => refresh());

  const fullHeight = content.layout().height;
  const body = scene.rexUI.add.scrollablePanel({
    width: contentWidth, height: fullHeight,
    panel: { child: content, mask: { maskType: 'stencil' } },
    clampChildOY: true,
    scrollDetectionMode: 'rectBounds',
    scroller: { threshold: 10 },
    mouseWheelScroller: { focus: 2, speed: 0.75 },
    slider: {
      track: scene.rexUI.add.roundRectangle(0, 0, 6, 10, 3, palette.scrollbarTrack).setDepth(pickerControlDepth),
      thumb: scene.rexUI.add.roundRectangle(0, 0, 6, 28, 3, palette.scrollbarThumb).setDepth(pickerControlDepth),
      adaptThumbSize: true,
      hideUnscrollableSlider: true,
    },
    space: { sliderY: gap },
  });
  // The scrollable block renders its clipped children at the block's depth.
  body.setDepth(pickerControlDepth);

  function isInsideBody(pointer: Phaser.Input.Pointer) {
    const camera = scene.cameras.main;
    const bounds = body.getBounds();
    const start = camera.getWorldPoint(pointer.downX, pointer.downY);
    const end = camera.getWorldPoint(pointer.x, pointer.y);
    return bounds.contains(start.x, start.y) && bounds.contains(end.x, end.y);
  }

  const actions = [
    makeButtonLabel(scene, 'Clear', 76, 52),
    makeButtonLabel(scene, 'Cancel', 88, 52),
    makeButtonLabel(scene, 'Apply', 88, 52, true),
  ];
  return showPickerDialog(scene, 'Filters', body, actions, (action) => onClose(action === 2 ? draft : undefined), {
    fitContent: (height) => {
      const offset = body.childOY;
      body.setMinSize(contentWidth, Math.min(fullHeight, height)).layout().setChildOY(offset, true);
    },
    handleAction: (action) => {
      if (action !== 0) return false;
      draft = noPuzzleFilters;
      refreshButtons.forEach((refresh) => refresh());
      return true;
    },
  });
}
