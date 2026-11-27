import { puzzleCredits } from '../creditsCatalog';
import type { PuzzleSource } from '../PuzzleSource';
import { drawLighthouse, LighthouseScene } from './LighthouseScene';

export const lighthouseSource: PuzzleSource = {
  title: 'Lighthouse',
  tags: { theme: 'Coast', type: 'Flat Illustration' },
  attribution: puzzleCredits.prototypeArtwork,
  maxViewport: { width: 1920, height: 1080 },
  scene: LighthouseScene,
  drawPreview: (scene, viewport) => drawLighthouse(scene, viewport).objects,
};
