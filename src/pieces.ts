import { sceneHeight, sceneWidth } from './PuzzleSourceScene';

export const columns = 4;
export const rows = 2;
export const cellWidth = sceneWidth / columns;
export const cellHeight = sceneHeight / rows;
export const tabDepth = 17;

type Point = { x: number; y: number };

// Shared by both sides of a seam. Reversing the edge and flipping its
// direction makes each tab fit the neighboring socket.
const tabProfile = [
  [-22, 0], [-10, 0], [-11, 4], [-14, 8], [-13, 12], [-9, 16],
  [-4, tabDepth], [4, tabDepth], [9, 16], [13, 12], [14, 8],
  [11, 4], [10, 0], [22, 0],
];

function edge(start: Point, end: Point, tab: number): Point[] {
  if (tab === 0) return [start];

  const dx = Math.sign(end.x - start.x);
  const dy = Math.sign(end.y - start.y);
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  return [start, ...tabProfile.map(([along, outward]) => ({
    x: centerX + dx * along + dy * outward * tab,
    y: centerY + dy * along - dx * outward * tab,
  }))];
}

export function pieceShape(column: number, row: number) {
  const x = column * cellWidth;
  const y = row * cellHeight;
  const topLeft = { x, y };
  const topRight = { x: x + cellWidth, y };
  const bottomRight = { x: x + cellWidth, y: y + cellHeight };
  const bottomLeft = { x, y: y + cellHeight };
  const tab = (column + row) % 2 === 0 ? 1 : -1;
  const outline = [
    ...edge(topLeft, topRight, row === 0 ? 0 : tab),
    ...edge(topRight, bottomRight, column === columns - 1 ? 0 : tab),
    ...edge(bottomRight, bottomLeft, row === rows - 1 ? 0 : tab),
    ...edge(bottomLeft, topLeft, column === 0 ? 0 : tab),
  ];

  const left = Math.min(...outline.map((point) => point.x));
  const top = Math.min(...outline.map((point) => point.y));
  return {
    left,
    top,
    width: Math.max(...outline.map((point) => point.x)) - left,
    height: Math.max(...outline.map((point) => point.y)) - top,
    points: outline.map((point) => ({ x: point.x - left, y: point.y - top })),
    centerX: x + cellWidth / 2 - left,
    centerY: y + cellHeight / 2 - top,
  };
}
