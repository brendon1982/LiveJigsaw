import type { PuzzleSource } from '../PuzzleSource';
import { drawLighthouse, LighthouseScene } from './LighthouseScene';

export const lighthouseSource: PuzzleSource = {
  title: 'Lighthouse',
  maxViewport: { width: 1024, height: 576 },
  scene: LighthouseScene,
  drawPreview: (scene, viewport) => drawLighthouse(scene, viewport).objects,
};
