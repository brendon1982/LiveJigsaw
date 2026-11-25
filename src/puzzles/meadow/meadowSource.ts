import type { PuzzleSource } from '../PuzzleSource';
import { drawMeadow, MeadowScene } from './MeadowScene';

export const meadowSource: PuzzleSource = {
  title: 'Meadow',
  tags: { theme: 'Countryside', type: 'Flat Illustration' },
  maxViewport: { width: 1024, height: 576 },
  scene: MeadowScene,
  drawPreview: (scene, viewport) => drawMeadow(scene, viewport).objects,
};
