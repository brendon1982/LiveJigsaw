import type { Board } from './Board.ts';
import { connectorStyles, type ConnectorStyleId } from './connectorStyles.ts';
import { Bounds, type Point } from './geometry.ts';
import { seededRandom } from './seededRandom.ts';

export class PieceOutline {
  readonly points: readonly Point[];
  readonly frame: Bounds;
  readonly localPoints: readonly Point[];

  private constructor(points: readonly Point[]) {
    this.points = points;
    this.frame = Bounds.around(points);
    this.localPoints = points.map((point) => this.frame.toLocal(point));
  }

  static forBoard(board: Board, styleId: ConnectorStyleId, seed: number): PieceOutline[] {
    const { rows, columns, cellSize: { width, height } } = board;
    const { profiles, offsets, scaleBase } = connectorStyles[styleId];
    const scale = Math.min(1, width / scaleBase, height / scaleBase);
    const seams: { right: Point[]; bottom: Point[] }[] = [];
    const random = seededRandom(seed);
    let seamIndex = 0;

    // Seam points exclude the grid corners, so either piece can trace them in its own direction.
    function cut(start: Point, end: Point, tab: number): Point[] {
      if (profiles.length === 0) return [];

      const profile = profiles[seamIndex % profiles.length];
      const offset = offsets[Math.floor(random() * offsets.length)];
      seamIndex += 1;
      const dx = Math.sign(end.x - start.x);
      const dy = Math.sign(end.y - start.y);
      const centerX = (start.x + end.x) / 2 + (end.x - start.x) * offset;
      const centerY = (start.y + end.y) / 2 + (end.y - start.y) * offset;
      return profile.map(([along, depth]) => ({
        x: centerX + (dx * along + dy * depth * tab) * scale,
        y: centerY + (dy * along - dx * depth * tab) * scale,
      }));
    }

    return board.cells.map(({ row, column, bounds: { x, y } }, index) => {
      const rightX = column + 1 === columns ? board.size.width : (column + 1) * width;
      const bottomY = row + 1 === rows ? board.size.height : (row + 1) * height;
      const topLeft = { x, y };
      const topRight = { x: rightX, y };
      const bottomRight = { x: rightX, y: bottomY };
      const bottomLeft = { x, y: bottomY };
      const tab = (column + row) % 2 === 0 ? 1 : -1;

      const top = row === 0 ? [] : [...seams[index - columns].bottom].reverse();
      const left = column === 0 ? [] : [...seams[index - 1].right].reverse();
      const right = column + 1 === columns ? [] : cut(topRight, bottomRight, tab);
      const bottom = row + 1 === rows ? [] : cut(bottomRight, bottomLeft, tab);
      seams.push({ right, bottom });

      return new PieceOutline([topLeft, ...top, topRight, ...right, bottomRight, ...bottom, bottomLeft, ...left]);
    });
  }
}
