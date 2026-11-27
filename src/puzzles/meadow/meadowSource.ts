import { puzzleCredits } from '../creditsCatalog';
import type { PuzzleSource } from '../PuzzleSource';
import { drawMeadow, MeadowScene } from './MeadowScene';

export const meadowSource: PuzzleSource = {
  title: 'Meadow',
  tags: { theme: 'Countryside', type: 'Flat Illustration' },
  motion: 'Animated',
  attribution: puzzleCredits.prototypeArtwork,
  maxViewport: { width: 1920, height: 1080 },
  scene: MeadowScene,
  drawPreview: (scene, viewport) => drawMeadow(scene, viewport).objects,
};
