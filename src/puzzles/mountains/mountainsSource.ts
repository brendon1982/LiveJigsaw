import type { PuzzleSource } from '../PuzzleSource';
import { drawMountains, MountainsScene } from './MountainsScene';

export const mountainsSource: PuzzleSource = {
  title: 'Mountains',
  tags: { theme: 'Mountains', type: 'Animated' },
  maxViewport: { width: 1024, height: 576 },
  scene: MountainsScene,
  drawPreview: (scene, viewport) => drawMountains(scene, viewport).objects,
};
