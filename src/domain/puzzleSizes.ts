import { Board } from './Board.ts';
import type { ChallengeMode } from './challengeModes.ts';
import type { ConnectorStyleId } from './connectorStyles.ts';
import type { Size } from './geometry.ts';
import { Puzzle } from './Puzzle.ts';

export type PuzzleSize = Size & Readonly<{
  label: string;
  columns: number;
  rows: number;
  snapTolerance: number;
}>;

export const puzzleSizes = [
  { label: 'Classic', width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 },
  { label: 'Large', width: 1024, height: 576, columns: 8, rows: 4, snapTolerance: 28 },
  { label: 'Dense', width: 1024, height: 576, columns: 8, rows: 8, snapTolerance: 18 },
  { label: 'Expert', width: 1024, height: 576, columns: 16, rows: 8, snapTolerance: 16 },
] as const satisfies readonly PuzzleSize[];

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
): Puzzle {
  const board = new Board(size, size.columns, size.rows);
  return new Puzzle(board, size.snapTolerance, connectorStyle, seed, challengeMode);
}

export function captureScale(size: Size, maximum: Size, textureLimit: number): number {
  const captureLimit = {
    width: Math.min(maximum.width, textureLimit),
    height: Math.min(maximum.height, textureLimit),
  };
  if (!fitsViewport(size, captureLimit)) throw new RangeError('The puzzle exceeds the available texture size');

  const supersampledSize = { width: size.width * 2, height: size.height * 2 };
  return fitsViewport(supersampledSize, captureLimit) ? 2 : 1;
}
