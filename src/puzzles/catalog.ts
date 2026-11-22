import { lighthouseSource } from './lighthouse/lighthouseSource';
import type { PuzzleSource } from './PuzzleSource';
import { windmillSource } from './windmill/windmillSource';

export const puzzleSources: readonly PuzzleSource[] = [
  windmillSource,
  lighthouseSource,
];
