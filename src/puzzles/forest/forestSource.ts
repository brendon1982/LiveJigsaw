import { puzzleCredits } from '../creditsCatalog';
import type { PuzzleSource } from '../PuzzleSource';
import { drawForest, ForestScene } from './ForestScene';

export const forestSource: PuzzleSource = {
  title: 'Forest',
  tags: { theme: 'Woodland', type: 'Flat Illustration' },
  motion: 'Animated',
  attribution: puzzleCredits.prototypeArtwork,
  maxViewport: { width: 1920, height: 1080 },
  scene: ForestScene,
  drawPreview: (scene, viewport) => drawForest(scene, viewport).objects,
};
