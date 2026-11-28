import type { UIScene } from './button';
import { puzzleSpacing } from './puzzleHeader';
import { pickerCardHeight, type makePuzzlePickerCard } from './PuzzlePickerCard';

type Card = ReturnType<typeof makePuzzlePickerCard>;
type CardLayout = { columns: number; width: number; stackStatus: boolean; compact: boolean };

export function makePickerCardGrid(scene: UIScene, createCard: (index: number) => Card) {
  const content = scene.rexUI.add.sizer().setOrigin(0);
  const mounted = new Map<number, Card>();
  let rows: { top: number; height: number }[] = [];
  let layout: CardLayout;
  let count = 0;
  let windowStart = -1;
  let windowEnd = -1;

  const placeCard = (card: Card, index: number) => {
    const { columns, width, stackStatus, compact } = layout;
    const row = rows[Math.floor(index / columns)];
    card.layout(width, stackStatus, compact);
    const x = index % columns * (width + puzzleSpacing);
    const y = row.top + (row.height - card.container.height) / 2;
    content.setChildLocalPosition(card.container, x, y);
  };
  const rowAt = (offset: number) => {
    let first = 0;
    let end = rows.length;
    while (first < end) {
      const middle = Math.floor((first + end) / 2);
      const row = rows[middle];
      if (row.top + row.height <= offset) first = middle + 1;
      else end = middle;
    }
    return first;
  };

  return {
    content,
    mountedCards: () => mounted.values(),
    clear() {
      for (const card of mounted.values()) card.container.destroy();
      mounted.clear();
      windowStart = windowEnd = -1;
    },
    reflow(next: CardLayout, cardCount: number, hasCredits: (index: number) => boolean) {
      layout = next;
      count = cardCount;
      const { columns, width, stackStatus, compact } = layout;
      rows = [];
      let top = 0;
      for (let start = 0; start < count; start += columns) {
        let height = 0;
        for (let index = start; index < Math.min(start + columns, count); index++) {
          height = Math.max(height, pickerCardHeight(width, stackStatus, compact, !compact && hasCredits(index)));
        }
        rows.push({ top, height });
        top += height + puzzleSpacing;
      }
      const gridWidth = columns * width + (columns - 1) * puzzleSpacing;
      content.setMinSize(gridWidth, Math.max(0, top - puzzleSpacing));
      for (const [index, card] of mounted) placeCard(card, index);
      windowStart = windowEnd = -1;
    },
    firstInView: (scrollTop: number) => rowAt(scrollTop) * layout.columns,
    offsetFor: (index: number) => -(rows[Math.floor(index / layout.columns)]?.top ?? 0),
    showWindow(scrollTop: number, viewportHeight: number) {
      const { columns } = layout;
      const start = Math.max(0, rowAt(scrollTop) - 1) * columns;
      const end = Math.min(count, (rowAt(scrollTop + viewportHeight) + 2) * columns);
      if (start === windowStart && end === windowEnd) return false;
      windowStart = start;
      windowEnd = end;
      for (const [index, card] of mounted) {
        if ((index < start || index >= end) && !card.previewInUse) {
          card.container.destroy();
          mounted.delete(index);
        }
      }
      for (let index = start; index < end; index++) {
        if (mounted.has(index)) continue;
        const card = createCard(index);
        content.pinLocal(card.container);
        placeCard(card, index);
        mounted.set(index, card);
      }
      return true;
    },
    refreshWindow() { windowStart = windowEnd = -1; },
  };
}