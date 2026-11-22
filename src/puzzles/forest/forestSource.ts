import type { PuzzleSource } from '../PuzzleSource';
import { drawForest, ForestScene } from './ForestScene';

export const forestSource: PuzzleSource = {
  title: 'Forest',
  maxViewport: { width: 1024, height: 576 },
  scene: ForestScene,
  drawPreview: (scene, viewport) => drawForest(scene, viewport).objects,
};
