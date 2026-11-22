import { Board } from './Board.ts';
import type { Size } from './geometry.ts';
import { Puzzle } from './Puzzle.ts';

export const puzzleSizes = [
  { label: 'Classic', width: 512, height: 288, columns: 4, rows: 2 },
  { label: 'Large', width: 1024, height: 576, columns: 8, rows: 4 },
] as const;

export type PuzzleSize = typeof puzzleSizes[number];

function fitsViewport(size: Size, maximum: Size): boolean {
  return size.width <= maximum.width && size.height <= maximum.height;
}

export function availablePuzzleSizes(maximum: Size): readonly PuzzleSize[] {
  return puzzleSizes.filter((size) => fitsViewport(size, maximum));
}

export function createPuzzle(size: PuzzleSize): Puzzle {
  return new Puzzle(new Board(size, size.columns, size.rows), 28);
}

export function captureScale(size: Size, maximum: Size, textureLimit: number): number {
  const limit = { width: Math.min(maximum.width, textureLimit), height: Math.min(maximum.height, textureLimit) };
  if (!fitsViewport(size, limit)) throw new RangeError('The puzzle exceeds the available texture size');
  return fitsViewport({ width: size.width * 2, height: size.height * 2 }, limit) ? 2 : 1;
}
