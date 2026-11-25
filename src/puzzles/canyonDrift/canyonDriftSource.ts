import { imagePreview } from '../imagePreview';
import type { PuzzleSource } from '../PuzzleSource';
import preview from './assets/preview.png';
import { CanyonDriftScene } from './CanyonDriftScene';

export const canyonDriftSource: PuzzleSource = {
  title: 'Canyon Drift',
  maxViewport: { width: 1920, height: 1080 },
  scene: CanyonDriftScene,
  ...imagePreview('canyon-drift-preview', preview),
};
