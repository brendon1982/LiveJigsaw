import type { Board, Cell } from './Board.ts';
import { connectorStyles, type ConnectorStyleId } from './connectorStyles.ts';
import { Bounds, type Point, type Size } from './geometry.ts';
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
    const cutSeam = createSeamCutter(styleId, board.cellSize, seed);
    const previousSeams: { right: Point[]; bottom: Point[] }[] = [];

    // Cells arrive in row order, so the neighbors above and to the left have already cut their seams.
    return board.cells.map((cell, cellIndex) => {
      const { row, column } = cell;
      const { topLeft, topRight, bottomRight, bottomLeft } = cellCorners(board, cell);
      const tabDirection = (column + row) % 2 === 0 ? 1 : -1;

      const topSeam = row === 0 ? [] : [...previousSeams[cellIndex - board.columns].bottom].reverse();
      const leftSeam = column === 0 ? [] : [...previousSeams[cellIndex - 1].right].reverse();
      const rightSeam = column === board.columns - 1 ? [] : cutSeam(topRight, bottomRight, tabDirection);
      const bottomSeam = row === board.rows - 1 ? [] : cutSeam(bottomRight, bottomLeft, tabDirection);
      previousSeams.push({ right: rightSeam, bottom: bottomSeam });

      const clockwisePoints = [
        topLeft, ...topSeam,
        topRight, ...rightSeam,
        bottomRight, ...bottomSeam,
        bottomLeft, ...leftSeam,
      ];
      return new PieceOutline(clockwisePoints);
    });
  }
}

function cellCorners(board: Board, { row, column, bounds }: Cell) {
  const { x: left, y: top } = bounds;
  // Use the board dimensions at its outer edges to avoid rounding past the boundary.
  const right = column === board.columns - 1 ? board.size.width : (column + 1) * board.cellSize.width;
  const bottom = row === board.rows - 1 ? board.size.height : (row + 1) * board.cellSize.height;
  return {
    topLeft: { x: left, y: top },
    topRight: { x: right, y: top },
    bottomRight: { x: right, y: bottom },
    bottomLeft: { x: left, y: bottom },
  };
}

function createSeamCutter(styleId: ConnectorStyleId, cellSize: Size, seed: number) {
  const { profiles, offsets, scaleBase } = connectorStyles[styleId];
  const profileScale = Math.min(1, cellSize.width / scaleBase, cellSize.height / scaleBase);
  const random = seededRandom(seed);
  let seamIndex = 0;

  // A seam contains the points between its corners, so both pieces can trace it in opposite directions.
  return function cutSeam(start: Point, end: Point, tabDirection: number): Point[] {
    if (profiles.length === 0) return [];

    const profile = profiles[seamIndex % profiles.length];
    const offsetIndex = Math.floor(random() * offsets.length);
    const centerOffset = offsets[offsetIndex];
    seamIndex += 1;

    const edgeX = end.x - start.x;
    const edgeY = end.y - start.y;
    const directionX = Math.sign(edgeX);
    const directionY = Math.sign(edgeY);
    const centerX = (start.x + end.x) / 2 + edgeX * centerOffset;
    const centerY = (start.y + end.y) / 2 + edgeY * centerOffset;

    return profile.map(([along, depth]) => {
      const offsetX = directionX * along + directionY * depth * tabDirection;
      const offsetY = directionY * along - directionX * depth * tabDirection;
      return { x: centerX + offsetX * profileScale, y: centerY + offsetY * profileScale };
    });
  };
}
