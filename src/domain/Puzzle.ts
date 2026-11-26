import type { Board, Cell } from './Board.ts';
import { challengeModes, type ChallengeMode } from './challengeModes.ts';
import type { ConnectorStyleId } from './connectorStyles.ts';
import type { Point } from './geometry.ts';
import { PieceOutline } from './PieceOutline.ts';
import { seededRandom } from './seededRandom.ts';

function pieceIdAt(row: number, column: number): string {
  return `piece-${row}-${column}`;
}

export class PuzzlePiece {
  readonly cell: Cell;
  readonly id: string;
  readonly target: Point;
  readonly outline: PieceOutline;

  constructor(cell: Cell, outline: PieceOutline) {
    this.cell = cell;
    this.id = pieceIdAt(cell.row, cell.column);
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

export type DropResult = 'placed' | 'missed' | 'already-placed' | 'blocked' | 'disconnected-from-seed';

export class Puzzle {
  readonly board: Board;
  readonly pieces: readonly PuzzlePiece[];
  readonly seed: number;
  readonly challengeMode: ChallengeMode;
  private readonly snapTolerance: number;
  private readonly piecesById: ReadonlyMap<string, PuzzlePiece>;
  private readonly trayOrder: readonly PuzzlePiece[];
  private readonly placedPieceIds = new Set<string>();

  constructor(
    board: Board,
    snapTolerance: number,
    connectorStyle: ConnectorStyleId = 'classic',
    seed = 0,
    challengeMode: ChallengeMode = 'none',
  ) {
    if (!Number.isFinite(snapTolerance) || snapTolerance < 0) {
      throw new RangeError('Snap tolerance must be finite and non-negative');
    }
    this.board = board;
    this.seed = seed;
    this.challengeMode = challengeMode;
    this.snapTolerance = snapTolerance;
    const outlines = PieceOutline.forBoard(board, connectorStyle, seed);
    this.pieces = board.cells.map((cell, cellIndex) => new PuzzlePiece(cell, outlines[cellIndex]));
    this.piecesById = new Map(this.pieces.map((piece) => [piece.id, piece]));
    this.trayOrder = shufflePieces(this.pieces, seed);
  }

  get placedCount(): number {
    return this.placedPieceIds.size;
  }

  get isComplete(): boolean {
    return this.placedCount === this.pieces.length;
  }

  get hidesGuide(): boolean {
    return challengeModes[this.challengeMode].hideGuide;
  }

  isPlaced(pieceId: string): boolean {
    return this.placedPieceIds.has(pieceId);
  }

  get trayPieces(): readonly PuzzlePiece[] {
    return this.trayOrder.filter(({ id }) => !this.isPlaced(id));
  }

  canDrag(pieceId: string): boolean {
    if (!this.piecesById.has(pieceId) || this.isPlaced(pieceId)) return false;
    const windowSize = challengeModes[this.challengeMode].trayWindow;
    if (windowSize === null) return true;

    let availableSlots: number = windowSize;
    for (const piece of this.trayOrder) {
      if (this.isPlaced(piece.id)) continue;
      if (piece.id === pieceId) return true;
      availableSlots -= 1;
      if (availableSlots === 0) return false;
    }
    return false;
  }

  joinedSeams(piece: PuzzlePiece): readonly (readonly Point[])[] {
    if (!this.isPlaced(piece.id)) return [];

    return neighboringEdges(piece)
      .filter(({ id }) => this.isPlaced(id))
      .map(({ edge }) => edge);
  }

  snapshotPlacements(): readonly string[] {
    return [...this.placedPieceIds];
  }

  /** Restores a snapshot of known, unique pieces without replaying live challenge rules. */
  restorePlacements(pieceIds: readonly string[]): boolean {
    const restored = new Set(pieceIds);
    if (restored.size !== pieceIds.length || pieceIds.some((id) => !this.piecesById.has(id))) return false;

    this.placedPieceIds.clear();
    for (const id of restored) this.placedPieceIds.add(id);
    return true;
  }

  drop(pieceId: string, position: Point): DropResult {
    const piece = this.piecesById.get(pieceId);
    if (!piece) throw new RangeError(`Unknown piece: ${pieceId}`);
    if (this.placedPieceIds.has(piece.id)) return 'already-placed';
    if (!this.canDrag(piece.id)) return 'blocked';
    if (!piece.acceptsDrop(position, this.snapTolerance)) return 'missed';
    if (challengeModes[this.challengeMode].requiresSeedConnection && !this.canJoinSeedGroup(piece)) {
      return 'disconnected-from-seed';
    }

    this.placedPieceIds.add(piece.id);
    return 'placed';
  }

  private canJoinSeedGroup(piece: PuzzlePiece): boolean {
    return this.placedCount === 0 || neighboringEdges(piece).some(({ id }) => this.isPlaced(id));
  }
}

function neighboringEdges(piece: PuzzlePiece) {
  const { row, column } = piece.cell;
  const { top, right, bottom, left } = piece.outline.edges;
  return [
    { id: pieceIdAt(row - 1, column), edge: top },
    { id: pieceIdAt(row, column + 1), edge: right },
    { id: pieceIdAt(row + 1, column), edge: bottom },
    { id: pieceIdAt(row, column - 1), edge: left },
  ];
}

function shufflePieces(pieces: readonly PuzzlePiece[], seed: number): readonly PuzzlePiece[] {
  const order = [...pieces];
  const random = seededRandom(seed);
  // Shuffle the full list before removing placements so the saved seed restores the order.
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  return order;
}
