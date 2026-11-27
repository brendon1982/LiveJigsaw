import { availablePuzzleSizes, getPieceCount } from '../domain/puzzleSizes.ts';
import { staticPuzzleSizes } from '../domain/staticPuzzleSizes.ts';
import type { PuzzleSource } from './PuzzleSource.ts';

export function puzzleSizeChoices({ motion, maxViewport }: Pick<PuzzleSource, 'motion' | 'maxViewport'>) {
  if (motion === 'Static') return staticPuzzleSizes(maxViewport);
  return availablePuzzleSizes(maxViewport).map((preset) => ({ targetCount: getPieceCount(preset.square), preset }));
}