import type { Board, Cell } from './Board.ts';
import type { ConnectorStyleId } from './connectorStyles.ts';
import type { Point } from './geometry.ts';
import { PieceOutline } from './PieceOutline.ts';

export class PuzzlePiece {
  readonly id: string;
  readonly target: Point;
  readonly outline: PieceOutline;

  constructor(cell: Cell, outline: PieceOutline) {
    this.id = `piece-${cell.row}-${cell.column}`;
    this.target = cell.bounds.center;
    this.outline = outline;
  }

  acceptsDrop(point: Point, tolerance: number): boolean {
    const offsetX = point.x - this.target.x;
    const offsetY = point.y - this.target.y;
    const distanceToTarget = Math.hypot(offsetX, offsetY);
    return distanceToTarget <= tolerance;
  }
}

export type DropResult = 'placed' | 'missed' | 'already-placed';

export class Puzzle {
  readonly board: Board;
  readonly pieces: readonly PuzzlePiece[];
  readonly seed: number;
  private readonly snapTolerance: number;
  private readonly piecesById: ReadonlyMap<string, PuzzlePiece>;
  private readonly placedPieceIds = new Set<string>();

  constructor(board: Board, snapTolerance: number, connectorStyle: ConnectorStyleId = 'classic', seed = 0) {
    if (!Number.isFinite(snapTolerance) || snapTolerance < 0) {
      throw new RangeError('Snap tolerance must be finite and non-negative');
    }
    this.board = board;
    this.seed = seed;
    this.snapTolerance = snapTolerance;
    const outlines = PieceOutline.forBoard(board, connectorStyle, seed);
    this.pieces = board.cells.map((cell, cellIndex) => new PuzzlePiece(cell, outlines[cellIndex]));
    this.piecesById = new Map(this.pieces.map((piece) => [piece.id, piece]));
  }

  get placedCount(): number {
    return this.placedPieceIds.size;
  }

  get isComplete(): boolean {
    return this.placedCount === this.pieces.length;
  }

  drop(pieceId: string, position: Point): DropResult {
    const piece = this.piecesById.get(pieceId);
    if (!piece) throw new RangeError(`Unknown piece: ${pieceId}`);
    if (this.placedPieceIds.has(piece.id)) return 'already-placed';
    if (!piece.acceptsDrop(position, this.snapTolerance)) return 'missed';

    this.placedPieceIds.add(piece.id);
    return 'placed';
  }
}
