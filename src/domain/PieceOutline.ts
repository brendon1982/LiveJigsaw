import type { Board, Cell } from './Board.ts';
import { connectorStyles, type ConnectorStyleId } from './connectorStyles.ts';
import { Bounds, type Point, type Size } from './geometry.ts';
import { seededRandom } from './seededRandom.ts';

type EdgePaths = Readonly<Record<'top' | 'right' | 'bottom' | 'left', readonly Point[]>>;

export class PieceOutline {
  readonly edges: EdgePaths;
  readonly points: readonly Point[];
  readonly frame: Bounds;
  readonly localPoints: readonly Point[];

  private constructor(edges: EdgePaths) {
    this.edges = edges;
    const clockwiseEdges = [edges.top, edges.right, edges.bottom, edges.left];
    this.points = clockwiseEdges.flatMap((edge) => edge.slice(0, -1));
    this.frame = Bounds.around(this.points);
    this.localPoints = this.points.map((point) => this.frame.toLocal(point));
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

      return new PieceOutline({
        top: [topLeft, ...topSeam, topRight],
        right: [topRight, ...rightSeam, bottomRight],
        bottom: [bottomRight, ...bottomSeam, bottomLeft],
        left: [bottomLeft, ...leftSeam, topLeft],
      });
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
