import type { PuzzleSource } from '../PuzzleSource';
import { drawMountains, MountainsScene } from './MountainsScene';

export const mountainsSource: PuzzleSource = {
  title: 'Mountains',
  tags: { theme: 'Mountains', type: 'Flat Illustration' },
  maxViewport: { width: 1920, height: 1080 },
  scene: MountainsScene,
  drawPreview: (scene, viewport) => drawMountains(scene, viewport).objects,
};
