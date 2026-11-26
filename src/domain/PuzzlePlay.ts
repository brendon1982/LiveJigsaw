import { Bounds, type Point } from './geometry.ts';
import { planEdgeSorting, planParkedShuffle, planTrayParking } from './parkedPieceLayout.ts';
import { PieceWorkspace, type ParkedGroup } from './PieceWorkspace.ts';
import type { DropResult, Puzzle, PuzzleRestore, PuzzleSnapshot } from './Puzzle.ts';

export type BoardDrop = Readonly<{
  kind: 'placed' | 'joined' | 'parked' | 'returned' | 'unchanged';
  guideResult: DropResult;
  lockedPieceIds: readonly string[];
}>;

export type PuzzlePlaySnapshot = PuzzleSnapshot & Readonly<{ parkedGroups: readonly ParkedGroup[] }>;
export type PuzzlePlayRestore = PuzzleRestore & Readonly<{ parkedGroups: readonly unknown[] }>;

export class PuzzlePlay {
  readonly puzzle: Puzzle;
  private readonly workspace: PieceWorkspace;
  private readonly homes: ReturnType<Puzzle['connectWorkspace']>;

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;
    this.workspace = new PieceWorkspace(puzzle);
    this.homes = puzzle.connectWorkspace();
  }

  get trayPieces() {
    return this.puzzle.trayPieces;
  }

  get parkedGroups(): readonly ParkedGroup[] {
    return this.workspace.parkedGroups;
  }

  get hasSortableParkedEdges(): boolean {
    return this.puzzle.challengeMode !== 'seed' && this.parkedGroups.some((group) => this.isParkedEdge(group));
  }

  groupOf(pieceId: string): ParkedGroup | undefined {
    return this.workspace.groupOf(pieceId);
  }

  positionOf(pieceId: string): Point | undefined {
    const group = this.groupOf(pieceId);
    return group && this.workspace.positionOf(group, pieceId);
  }

  orientationOf(pieceId: string): number {
    return this.groupOf(pieceId)?.quarterTurns ?? this.puzzle.orientationOf(pieceId);
  }

  private restrictsSeedParking(allowLoosePiecesOnBoard: boolean): boolean {
    return allowLoosePiecesOnBoard && this.puzzle.challengeMode === 'seed';
  }

  dropOnBoard(grabbedPieceId: string, center: Point, allowLoosePiecesOnBoard = true): BoardDrop {
    if (this.puzzle.isPlaced(grabbedPieceId)) return boardDrop('unchanged', 'already-placed');
    const lifted = this.groupOf(grabbedPieceId);
    const memberIds = lifted?.memberIds ?? [grabbedPieceId];
    if (!memberIds.every((id) => this.puzzle.canDrag(id))) return boardDrop('unchanged', 'blocked');
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return boardDrop('unchanged', 'missed');

    const group = {
      memberIds, anchorPieceId: grabbedPieceId, position: center, quarterTurns: this.orientationOf(grabbedPieceId),
    };
    const members = memberIds.map((id) => ({ id, position: this.workspace.positionOf(group, id) }));
    const restrictedParking = this.restrictsSeedParking(allowLoosePiecesOnBoard);
    const guideResult = this.homes.placeGroup(members, group.quarterTurns);
    if (guideResult === 'placed') {
      if (lifted) this.workspace.remove(lifted);
      if (restrictedParking) this.returnAllParkedToTray();
      return boardDrop('placed', guideResult, memberIds);
    }

    if (restrictedParking && this.puzzle.placedCount > 0) {
      this.returnToTray(grabbedPieceId);
      return boardDrop('returned', guideResult);
    }

    const parkOnMiss = allowLoosePiecesOnBoard && (!restrictedParking || !!lifted || !this.parkedGroups.length);
    const settled = this.workspace.settleDrop(group, { lifted, parkOnMiss });
    if (!settled) return boardDrop(lifted ? 'unchanged' : 'returned', guideResult);
    if (!lifted) this.homes.takeFromTray(grabbedPieceId);
    return boardDrop(settled, guideResult);
  }

  moveTrayToBoard(area: Bounds, allowLoosePiecesOnBoard: boolean, random = Math.random): boolean {
    if (!allowLoosePiecesOnBoard || this.puzzle.challengeMode === 'seed') return false;
    const tray = this.trayPieces.map((piece) => ({ piece, quarterTurns: this.puzzle.orientationOf(piece.id) }));
    if (tray.length === 0) return false;

    const occupied = [...this.workspace.occupiedFootprints(), ...this.placedFootprints()];
    const parking = planTrayParking(tray, area, this.guideBounds(), occupied, random);
    if (parking.length === 0) return false;

    this.workspace.parkSingles(parking);
    for (const { pieceId } of parking) this.homes.takeFromTray(pieceId);
    return true;
  }

  shuffleParkedPieces(area: Bounds, random = Math.random): boolean {
    const groups = this.parkedGroups.map((group) => this.workspace.layoutOf(group));
    if (groups.length === 0) return false;

    const positions = planParkedShuffle(groups, area, this.guideBounds(), this.placedFootprints(), random);
    return this.workspace.moveGroups(positions);
  }

  sortParkedEdges(at: Point, area: Bounds, random = Math.random): boolean {
    if (this.puzzle.challengeMode === 'seed') return false;
    const edges = [];
    const otherGroups = [];
    for (const group of this.parkedGroups) {
      const layout = this.workspace.layoutOf(group);
      if (this.isParkedEdge(group)) edges.push(layout);
      else otherGroups.push(layout);
    }
    if (edges.length === 0) return false;

    const positions = planEdgeSorting(edges, otherGroups, at, area, this.placedFootprints(), random);
    return this.workspace.moveGroups(positions);
  }

  private isParkedEdge(group: ParkedGroup): boolean {
    if (group.memberIds.length !== 1) return false;
    const { row, column } = this.puzzle.pieceById(group.anchorPieceId)!.cell;
    const { rows, columns } = this.puzzle.board;
    return row === 0 || row === rows - 1 || column === 0 || column === columns - 1;
  }

  private guideBounds(): Bounds {
    const { width, height } = this.puzzle.board.size;
    return new Bounds(0, 0, width, height);
  }

  private placedFootprints(): Bounds[] {
    return this.puzzle.pieces.filter(({ id }) => this.puzzle.isPlaced(id)).map(({ outline }) => outline.frame);
  }

  returnToTray(grabbedPieceId: string): boolean {
    const group = this.groupOf(grabbedPieceId);
    if (!group) return false;
    this.workspace.remove(group);
    this.homes.returnToTray(group.memberIds, group.quarterTurns);
    return true;
  }

  returnAllParkedToTray(): boolean {
    if (this.parkedGroups.length === 0) return false;
    for (const group of this.parkedGroups) this.homes.returnToTray(group.memberIds, group.quarterTurns);
    this.workspace.replaceGroups([]);
    return true;
  }

  turnPiece(pieceId: string): boolean {
    if (!this.puzzle.pieceRotation || !this.puzzle.canDrag(pieceId)) return false;
    const group = this.groupOf(pieceId);
    if (!group) return this.homes.turnTrayPiece(pieceId);
    this.workspace.turn(group, pieceId);
    return true;
  }

  breakOff(pieceId: string, allowLoosePiecesOnBoard = true): boolean {
    const group = this.groupOf(pieceId);
    const keepDetached = !this.restrictsSeedParking(allowLoosePiecesOnBoard);
    if (!group || !this.workspace.breakOff(group, pieceId, { keepDetached })) return false;
    if (!keepDetached) this.homes.returnToTray([pieceId], group.quarterTurns);
    return true;
  }

  snapshot(): PuzzlePlaySnapshot {
    return { ...this.puzzle.snapshot(), parkedGroups: this.parkedGroups };
  }

  restore(snapshot: PuzzlePlayRestore): boolean {
    const groups = this.workspace.readSnapshot(snapshot.parkedGroups);
    if (!groups) return false;
    const parkedIds = new Set(groups.flatMap(({ memberIds }) => memberIds));
    const joinedIds = groups.filter(({ memberIds }) => memberIds.length > 1).flatMap(({ memberIds }) => memberIds);
    if (!this.homes.restoreHomes(snapshot, parkedIds, joinedIds)) return false;
    this.workspace.replaceGroups(groups);
    return true;
  }
}

function boardDrop(kind: BoardDrop['kind'], guideResult: DropResult, lockedPieceIds: readonly string[] = []): BoardDrop {
  return { kind, guideResult, lockedPieceIds };
}