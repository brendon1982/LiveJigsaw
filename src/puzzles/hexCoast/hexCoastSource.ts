import { imagePreview } from '../imagePreview';
import type { PuzzleSource } from '../PuzzleSource';
import { HexCoastScene } from './HexCoastScene';
import { coastSize } from './hexCoastLayout';
import previewImage from './assets/preview.png';

export const hexCoastSource: PuzzleSource = {
  title: 'Hex Coast',
  maxViewport: coastSize,
  scene: HexCoastScene,
  ...imagePreview('hex-coast-preview', previewImage),
};
