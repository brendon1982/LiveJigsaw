import { drawLighthouse, LighthouseScene } from './LighthouseScene';
import type { PuzzleSource } from './PuzzleSource';
import { drawWindmill, WindmillScene } from './WindmillScene';

export const puzzleSources: readonly PuzzleSource[] = [
  {
    title: 'Windmill',
    maxViewport: { width: 1024, height: 576 },
    scene: WindmillScene,
    drawPreview: (scene, viewport) => drawWindmill(scene, viewport).objects,
  },
  {
    title: 'Lighthouse',
    maxViewport: { width: 1024, height: 576 },
    scene: LighthouseScene,
    drawPreview: (scene, viewport) => drawLighthouse(scene, viewport).objects,
  },
];
