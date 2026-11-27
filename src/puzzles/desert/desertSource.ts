import { puzzleCredits } from '../creditsCatalog';
import type { PuzzleSource } from '../PuzzleSource';
import { DesertScene, drawDesert } from './DesertScene';

export const desertSource: PuzzleSource = {
  title: 'Desert',
  tags: { theme: 'Desert', type: 'Flat Illustration' },
  motion: 'Animated',
  attribution: puzzleCredits.prototypeArtwork,
  maxViewport: { width: 1920, height: 1080 },
  scene: DesertScene,
  drawPreview: (scene, viewport) => drawDesert(scene, viewport).objects,
};
