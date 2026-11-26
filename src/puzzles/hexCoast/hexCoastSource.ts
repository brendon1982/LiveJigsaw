import { imagePreview } from '../imagePreview';
import type { PuzzleSource } from '../PuzzleSource';
import { HexCoastScene } from './HexCoastScene';
import previewImage from './assets/preview.png';

export const hexCoastSource: PuzzleSource = {
  title: 'Hex Coast',
  tags: { theme: 'Coast', type: 'Procedural' },
  maxViewport: { width: 1920, height: 1080 },
  scene: HexCoastScene,
  ...imagePreview('hex-coast-preview', previewImage),
};
