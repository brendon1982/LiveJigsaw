import type { Point } from './geometry.ts';
import { PieceWorkspace, type ParkedGroup } from './PieceWorkspace.ts';
import type { DropResult, Puzzle, PuzzleRestore, PuzzleSnapshot } from './Puzzle.ts';

export type MissedDropMode = 'return-to-tray' | 'park-on-board';

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

  dropOnBoard(grabbedPieceId: string, center: Point, missedDropMode: MissedDropMode = 'return-to-tray'): BoardDrop {
    if (this.puzzle.isPlaced(grabbedPieceId)) return boardDrop('unchanged', 'already-placed');
    const lifted = this.groupOf(grabbedPieceId);
    const memberIds = lifted?.memberIds ?? [grabbedPieceId];
    if (!memberIds.every((id) => this.puzzle.canDrag(id))) return boardDrop('unchanged', 'blocked');
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return boardDrop('unchanged', 'missed');

    const group = {
      memberIds, anchorPieceId: grabbedPieceId, position: center, quarterTurns: this.orientationOf(grabbedPieceId),
    };
    const members = memberIds.map((id) => ({ id, position: this.workspace.positionOf(group, id) }));
    const guideResult = this.homes.placeGroup(members, group.quarterTurns);
    if (guideResult === 'placed') {
      if (lifted) this.workspace.remove(lifted);
      return boardDrop('placed', guideResult, memberIds);
    }

    const settled = this.workspace.settleDrop(group, { lifted, parkOnMiss: missedDropMode === 'park-on-board' });
    if (!settled) return boardDrop(lifted ? 'unchanged' : 'returned', guideResult);
    if (!lifted) this.homes.takeFromTray(grabbedPieceId);
    return boardDrop(settled, guideResult);
  }

  returnToTray(grabbedPieceId: string): boolean {
    const group = this.groupOf(grabbedPieceId);
    if (!group) return false;
    this.workspace.remove(group);
    this.homes.returnToTray(group.memberIds, group.quarterTurns);
    return true;
  }

  turnPiece(pieceId: string): boolean {
    if (!this.puzzle.pieceRotation || !this.puzzle.canDrag(pieceId)) return false;
    const group = this.groupOf(pieceId);
    if (!group) return this.homes.turnTrayPiece(pieceId);
    this.workspace.turn(group, pieceId);
    return true;
  }

  breakOff(pieceId: string): boolean {
    const group = this.groupOf(pieceId);
    return !!group && this.workspace.breakOff(group, pieceId);
  }

  snapshot(): PuzzlePlaySnapshot {
    return { ...this.puzzle.snapshot(), parkedGroups: this.parkedGroups };
  }

  restore(snapshot: PuzzlePlayRestore): boolean {
    const groups = this.workspace.readSnapshot(snapshot.parkedGroups);
    if (!groups) return false;
    const parkedIds = new Set(groups.flatMap(({ memberIds }) => memberIds));
    if (!this.homes.restoreHomes(snapshot, parkedIds)) return false;
    this.workspace.replaceGroups(groups);
    return true;
  }
}

function boardDrop(kind: BoardDrop['kind'], guideResult: DropResult, lockedPieceIds: readonly string[] = []): BoardDrop {
  return { kind, guideResult, lockedPieceIds };
}