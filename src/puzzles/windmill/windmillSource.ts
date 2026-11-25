import type { PuzzleSource } from '../PuzzleSource';
import { drawWindmill, WindmillScene } from './WindmillScene';

export const windmillSource: PuzzleSource = {
  title: 'Windmill',
  tags: { theme: 'Countryside', type: 'Flat Illustration' },
  maxViewport: { width: 1024, height: 576 },
  scene: WindmillScene,
  drawPreview: (scene, viewport) => drawWindmill(scene, viewport).objects,
};
