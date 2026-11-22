import type { Board, Cell } from './Board.ts';
import { Bounds, type Point } from './geometry.ts';

export const tabDepth = 17;

// Both sides of a seam use this profile, in opposite directions.
const tabProfile = [
  [-22, 0], [-10, 0], [-11, 4], [-14, 8], [-13, 12], [-9, 16],
  [-4, tabDepth], [4, tabDepth], [9, 16], [13, 12], [14, 8],
  [11, 4], [10, 0], [22, 0],
];

function edge(start: Point, end: Point, tab: number, scale: number): Point[] {
  if (tab === 0) return [start];

  const dx = Math.sign(end.x - start.x);
  const dy = Math.sign(end.y - start.y);
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  return [start, ...tabProfile.map(([along, outward]) => ({
    x: centerX + (dx * along + dy * outward * tab) * scale,
    y: centerY + (dy * along - dx * outward * tab) * scale,
  }))];
}

export class PieceOutline {
  readonly points: readonly Point[];
  readonly frame: Bounds;
  readonly localPoints: readonly Point[];

  private constructor(points: readonly Point[]) {
    this.points = points;
    this.frame = Bounds.around(points);
    this.localPoints = points.map((point) => this.frame.toLocal(point));
  }

  static forCell(board: Board, cell: Cell): PieceOutline {
    const { column, row, bounds: { x, y, width, height } } = cell;
    const topLeft = { x, y };
    const topRight = { x: x + width, y };
    const bottomRight = { x: x + width, y: y + height };
    const bottomLeft = { x, y: y + height };
    const tab = (column + row) % 2 === 0 ? 1 : -1;

    const scale = Math.min(1, width / 64, height / 64);
    return new PieceOutline([
      ...edge(topLeft, topRight, row === 0 ? 0 : tab, scale),
      ...edge(topRight, bottomRight, column === board.columns - 1 ? 0 : tab, scale),
      ...edge(bottomRight, bottomLeft, row === board.rows - 1 ? 0 : tab, scale),
      ...edge(bottomLeft, topLeft, column === 0 ? 0 : tab, scale),
    ]);
  }
}
