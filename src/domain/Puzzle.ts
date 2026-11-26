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

export type DropResult = 'placed' | 'missed' | 'already-placed' | 'blocked' | 'wrong-orientation' | 'disconnected-from-seed';

export type PuzzleSnapshot = Readonly<{
  placedPieceIds: readonly string[];
  trayOrientations: Readonly<Record<string, number>>;
}>;

export class Puzzle {
  readonly board: Board;
  readonly pieces: readonly PuzzlePiece[];
  readonly seed: number;
  readonly challengeMode: ChallengeMode;
  readonly pieceRotation: boolean;
  private readonly snapTolerance: number;
  private readonly piecesById: ReadonlyMap<string, PuzzlePiece>;
  private readonly trayOrder: readonly PuzzlePiece[];
  private placedPieceIds = new Set<string>();
  private trayOrientations: Map<string, number>;

  constructor(
    board: Board,
    snapTolerance: number,
    connectorStyle: ConnectorStyleId = 'classic',
    seed = 0,
    challengeMode: ChallengeMode = 'none',
    pieceRotation = false,
  ) {
    if (!Number.isFinite(snapTolerance) || snapTolerance < 0) {
      throw new RangeError('Snap tolerance must be finite and non-negative');
    }
    this.board = board;
    this.seed = seed;
    this.challengeMode = challengeMode;
    this.pieceRotation = pieceRotation;
    this.snapTolerance = snapTolerance;
    this.pieces = buildPieces(board, connectorStyle, seed);
    this.piecesById = new Map(this.pieces.map((piece) => [piece.id, piece]));
    this.trayOrder = shufflePieces(this.pieces, seed);
    this.trayOrientations = pieceRotation ? startingOrientations(this.pieces, seed) : new Map();
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

  orientationOf(pieceId: string): number {
    return this.trayOrientations.get(pieceId) ?? 0;
  }

  turnPiece(pieceId: string): boolean {
    if (!this.pieceRotation || !this.canDrag(pieceId)) return false;
    this.trayOrientations.set(pieceId, (this.orientationOf(pieceId) + 1) % 4);
    return true;
  }

  snapshot(): PuzzleSnapshot {
    return { placedPieceIds: [...this.placedPieceIds], trayOrientations: Object.fromEntries(this.trayOrientations) };
  }

  /** Validates the whole snapshot before restoring, without replaying live challenge rules. */
  restore({ placedPieceIds, trayOrientations }: {
    placedPieceIds: readonly string[];
    trayOrientations: Readonly<Record<string, unknown>>;
  }): boolean {
    const placements = new Set(placedPieceIds);
    if (placements.size !== placedPieceIds.length || placedPieceIds.some((id) => !this.piecesById.has(id))) return false;

    const orientations = new Map<string, number>();
    const expectedTurns = this.pieceRotation ? this.pieces.length - placements.size : 0;
    const entries = Object.entries(trayOrientations);
    if (entries.length !== expectedTurns) return false;
    for (const [id, turns] of entries) {
      if (!this.piecesById.has(id) || placements.has(id)
        || typeof turns !== 'number' || !Number.isInteger(turns) || turns < 0 || turns > 3) return false;
      orientations.set(id, turns);
    }

    this.placedPieceIds = placements;
    this.trayOrientations = orientations;
    return true;
  }

  drop(pieceId: string, position: Point): DropResult {
    const piece = this.piecesById.get(pieceId);
    if (!piece) throw new RangeError(`Unknown piece: ${pieceId}`);
    if (this.placedPieceIds.has(piece.id)) return 'already-placed';
    if (!this.canDrag(piece.id)) return 'blocked';
    if (this.orientationOf(piece.id) !== 0) return 'wrong-orientation';
    if (!piece.acceptsDrop(position, this.snapTolerance)) return 'missed';
    if (challengeModes[this.challengeMode].requiresSeedConnection && !this.canJoinSeedGroup(piece)) {
      return 'disconnected-from-seed';
    }

    this.placedPieceIds.add(piece.id);
    this.trayOrientations.delete(piece.id);
    return 'placed';
  }

  private canJoinSeedGroup(piece: PuzzlePiece): boolean {
    return this.placedCount === 0 || neighboringEdges(piece).some(({ id }) => this.isPlaced(id));
  }
}

function buildPieces(board: Board, connectorStyle: ConnectorStyleId, seed: number): readonly PuzzlePiece[] {
  const outlines = PieceOutline.forBoard(board, connectorStyle, seed);
  return board.cells.map((cell, cellIndex) => new PuzzlePiece(cell, outlines[cellIndex]));
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

function startingOrientations(pieces: readonly PuzzlePiece[], seed: number): Map<string, number> {
  const random = seededRandom((seed ^ 0x9e3779b9) >>> 0);
  const orientations = new Map<string, number>();
  for (const { id } of pieces) orientations.set(id, Math.floor(random() * 4));
  return orientations;
}
