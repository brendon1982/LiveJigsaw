import { desertSource } from './desert/desertSource';
import { forestSource } from './forest/forestSource';
import { lighthouseSource } from './lighthouse/lighthouseSource';
import { meadowSource } from './meadow/meadowSource';
import { mountainsSource } from './mountains/mountainsSource';
import type { PuzzleSource } from './PuzzleSource';
import { windmillSource } from './windmill/windmillSource';

export const puzzleSources: readonly PuzzleSource[] = [
  windmillSource,
  lighthouseSource,
  mountainsSource,
  meadowSource,
  desertSource,
  forestSource,
];
