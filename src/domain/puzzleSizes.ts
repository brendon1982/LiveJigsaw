import { Board } from './Board.ts';
import type { ChallengeMode } from './challengeModes.ts';
import type { ConnectorStyleId } from './connectorStyles.ts';
import type { Size } from './geometry.ts';
import { Puzzle } from './Puzzle.ts';

export type PuzzleSize = Size & Readonly<{
  columns: number;
  rows: number;
  snapTolerance: number;
}>;

export const puzzleSizes = [
  { width: 1024, height: 576, columns: 8, rows: 4, snapTolerance: 28 },
  { width: 1024, height: 576, columns: 8, rows: 8, snapTolerance: 18 },
  { width: 1024, height: 576, columns: 16, rows: 8, snapTolerance: 16 },
  { width: 1536, height: 864, columns: 24, rows: 12, snapTolerance: 16 },
  { width: 1792, height: 1008, columns: 28, rows: 14, snapTolerance: 16 },
] as const satisfies readonly PuzzleSize[];

export function getPieceCount({ columns, rows }: Pick<PuzzleSize, 'columns' | 'rows'>): number {
  return columns * rows;
}

function fitsViewport(size: Size, maximum: Size): boolean {
  return size.width <= maximum.width && size.height <= maximum.height;
}

export function availablePuzzleSizes(maximum: Size): readonly PuzzleSize[] {
  return puzzleSizes.filter((size) => fitsViewport(size, maximum));
}

export function createPuzzle(
  size: PuzzleSize,
  connectorStyle: ConnectorStyleId = 'classic',
  seed = 0,
  challengeMode: ChallengeMode = 'none',
  pieceRotation = false,
): Puzzle {
  const board = new Board(size, size.columns, size.rows);
  return new Puzzle(board, size.snapTolerance, connectorStyle, seed, challengeMode, pieceRotation);
}
