import { Bounds, type Size } from '../domain/geometry.ts';
import type { PuzzlePiece } from '../domain/Puzzle.ts';

export function playWorkspace({ width, height }: Size): Bounds {
  return new Bounds(24, 140, Math.max(1, width - 48), Math.max(1, height - 164));
}

// Keep the prototype's starting order for Classic and provide an order for larger puzzles.
const preferredOrder = [5, 2, 7, 0, 3, 6, 1, 4];

export function arrangeTray(pieces: readonly PuzzlePiece[]): PuzzlePiece[] {
  const indexes = new Set([...preferredOrder, ...pieces.keys()]);
  return [...indexes].filter((index) => index < pieces.length).map((index) => pieces[index]);
}
