import { drawLighthouse, LighthouseScene } from './LighthouseScene';
import type { PuzzleSource } from './PuzzleSource';
import { drawWindmill, WindmillScene } from './WindmillScene';

export const puzzleSources: readonly PuzzleSource[] = [
  {
    title: 'Windmill',
    scene: WindmillScene,
    drawPreview: (scene, viewport) => drawWindmill(scene, viewport).objects,
  },
  {
    title: 'Lighthouse',
    scene: LighthouseScene,
    drawPreview: (scene, viewport) => drawLighthouse(scene, viewport).objects,
  },
];
