import type { PuzzleSource } from '../PuzzleSource';
import { DesertScene, drawDesert } from './DesertScene';

export const desertSource: PuzzleSource = {
  title: 'Desert',
  tags: { theme: 'Desert', type: 'Animated' },
  maxViewport: { width: 1024, height: 576 },
  scene: DesertScene,
  drawPreview: (scene, viewport) => drawDesert(scene, viewport).objects,
};
