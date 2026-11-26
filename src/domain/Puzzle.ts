import type { Board, Cell } from './Board.ts';
import { challengeModes, type ChallengeMode } from './challengeModes.ts';
import type { ConnectorStyleId } from './connectorStyles.ts';
import { isQuarterTurns, type Point } from './geometry.ts';
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

export type PuzzleRestore = Readonly<{
  placedPieceIds: readonly string[];
  trayOrientations: Readonly<Record<string, unknown>>;
}>;

export class Puzzle {
  readonly board: Board;
  readonly pieces: readonly PuzzlePiece[];
  readonly seed: number;
  readonly challengeMode: ChallengeMode;
  readonly pieceRotation: boolean;
  readonly snapTolerance: number;
  private readonly piecesById: ReadonlyMap<string, PuzzlePiece>;
  private readonly trayOrder: readonly PuzzlePiece[];
  private placedPieceIds = new Set<string>();
  private trayOrientations: Map<string, number>;
  private workspaceConnected = false;

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
    this.trayOrientations = pieceRotation
      ? startingOrientations(this.pieces, seed)
      : new Map(this.pieces.map(({ id }) => [id, 0]));
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
    return this.trayOrder.filter(({ id }) => this.trayOrientations.has(id));
  }

  canDrag(pieceId: string): boolean {
    return this.isEligible(pieceId, this.placedPieceIds);
  }

  pieceById(pieceId: string): PuzzlePiece | undefined {
    return this.piecesById.get(pieceId);
  }

  neighborIds(pieceId: string): readonly string[] {
    const piece = this.piecesById.get(pieceId);
    return piece ? neighboringEdges(piece).map(({ id }) => id).filter((id) => this.piecesById.has(id)) : [];
  }

  private isEligible(pieceId: string, placements: ReadonlySet<string>): boolean {
    if (!this.piecesById.has(pieceId) || placements.has(pieceId)) return false;
    const windowSize = challengeModes[this.challengeMode].trayWindow;
    if (windowSize === null) return true;

    let availableSlots: number = windowSize;
    for (const piece of this.trayOrder) {
      if (placements.has(piece.id)) continue;
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
    return !this.workspaceConnected && this.turnTrayPiece(pieceId);
  }

  private turnTrayPiece(pieceId: string): boolean {
    if (!this.pieceRotation || !this.trayOrientations.has(pieceId) || !this.canDrag(pieceId)) return false;
    this.trayOrientations.set(pieceId, (this.orientationOf(pieceId) + 1) % 4);
    return true;
  }

  snapshot(): PuzzleSnapshot {
    return {
      placedPieceIds: [...this.placedPieceIds],
      trayOrientations: this.pieceRotation ? Object.fromEntries(this.trayOrientations) : {},
    };
  }

  /** Validates the whole snapshot before restoring, without replaying live challenge rules. */
  restore(snapshot: PuzzleRestore): boolean {
    return !this.workspaceConnected && this.restoreHomes(snapshot, new Set());
  }

  connectWorkspace() {
    if (this.workspaceConnected) throw new Error('Puzzle already has a workspace');
    this.workspaceConnected = true;
    return {
      placeGroup: this.placeGroup.bind(this),
      turnTrayPiece: this.turnTrayPiece.bind(this),
      takeFromTray: (id: string) => this.trayOrientations.delete(id),
      returnToTray: (ids: readonly string[], quarterTurns: number) => {
        for (const id of ids) this.trayOrientations.set(id, quarterTurns);
      },
      restoreHomes: this.restoreHomes.bind(this),
    };
  }

  private restoreHomes({ placedPieceIds, trayOrientations }: PuzzleRestore, parkedIds: ReadonlySet<string>): boolean {
    if (!Array.isArray(placedPieceIds) || !trayOrientations
      || typeof trayOrientations !== 'object' || Array.isArray(trayOrientations)) return false;
    const placements = new Set(placedPieceIds);
    if (placements.size !== placedPieceIds.length || placedPieceIds.some((id) => !this.piecesById.has(id))) return false;
    for (const id of parkedIds) {
      if (!this.isEligible(id, placements)) return false;
    }

    const orientations = new Map<string, number>();
    const entries = Object.entries(trayOrientations);
    const expectedTurns = this.pieceRotation ? this.pieces.length - placements.size - parkedIds.size : 0;
    if (entries.length !== expectedTurns) return false;
    for (const [id, turns] of entries) {
      if (!this.piecesById.has(id) || placements.has(id) || parkedIds.has(id) || !isQuarterTurns(turns)) return false;
      orientations.set(id, turns);
    }
    if (!this.pieceRotation) {
      for (const { id } of this.pieces) {
        if (!placements.has(id) && !parkedIds.has(id)) orientations.set(id, 0);
      }
    }

    this.placedPieceIds = placements;
    this.trayOrientations = orientations;
    return true;
  }

  drop(pieceId: string, position: Point): DropResult {
    if (!this.piecesById.has(pieceId)) throw new RangeError(`Unknown piece: ${pieceId}`);
    if (this.isPlaced(pieceId)) return 'already-placed';
    if (this.workspaceConnected) return 'blocked';
    return this.placeGroup([{ id: pieceId, position }], this.orientationOf(pieceId));
  }

  private placeGroup(members: readonly { id: string; position: Point }[], quarterTurns: number): DropResult {
    const ids = members.map(({ id }) => id);
    if (ids.some((id) => this.isPlaced(id))) return 'already-placed';
    if (ids.length === 0 || ids.some((id) => !this.canDrag(id))) return 'blocked';
    if (quarterTurns !== 0) return 'wrong-orientation';
    if (!members.every(({ id, position }) => this.piecesById.get(id)!.acceptsDrop(position, this.snapTolerance))) {
      return 'missed';
    }
    if (challengeModes[this.challengeMode].requiresSeedConnection && this.placedCount > 0
      && !ids.some((id) => this.neighborIds(id).some((neighborId) => this.isPlaced(neighborId)))) {
      return 'disconnected-from-seed';
    }

    for (const id of ids) {
      this.placedPieceIds.add(id);
      this.trayOrientations.delete(id);
    }
    return 'placed';
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
