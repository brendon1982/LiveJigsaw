import { availablePuzzleSizes, getPieceCount } from '../domain/puzzleSizes.ts';
import { hasStaticPuzzleSize, staticPuzzleSizes } from '../domain/staticPuzzleSizes.ts';
import type { PuzzleSource } from './PuzzleSource.ts';

export function hasPuzzleSizeChoice({ motion, maxViewport }: Pick<PuzzleSource, 'motion' | 'maxViewport'>) {
  return motion === 'Static' ? hasStaticPuzzleSize(maxViewport) : availablePuzzleSizes(maxViewport).length > 0;
}

export function puzzleSizeChoices({ motion, maxViewport }: Pick<PuzzleSource, 'motion' | 'maxViewport'>) {
  if (motion === 'Static') return staticPuzzleSizes(maxViewport);
  return availablePuzzleSizes(maxViewport).map((preset) => ({ targetCount: getPieceCount(preset.square), preset }));
}