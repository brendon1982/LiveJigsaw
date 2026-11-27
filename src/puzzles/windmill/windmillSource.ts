import { puzzleCredits } from '../creditsCatalog';
import type { PuzzleSource } from '../PuzzleSource';
import { drawWindmill, WindmillScene } from './WindmillScene';

export const windmillSource: PuzzleSource = {
  title: 'Windmill',
  tags: { theme: 'Countryside', type: 'Flat Illustration' },
  attribution: puzzleCredits.prototypeArtwork,
  maxViewport: { width: 1920, height: 1080 },
  scene: WindmillScene,
  drawPreview: (scene, viewport) => drawWindmill(scene, viewport).objects,
};
