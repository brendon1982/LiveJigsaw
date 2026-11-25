import type { PuzzleSource } from '../PuzzleSource';
import { HexCoastScene } from './HexCoastScene';
import { coastSize } from './hexCoastLayout';
import previewImage from './assets/preview.png';

const previewKey = 'hex-coast-preview';

export const hexCoastSource: PuzzleSource = {
  title: 'Hex Coast',
  maxViewport: coastSize,
  scene: HexCoastScene,
  preloadPreview(scene) {
    if (!scene.textures.exists(previewKey)) scene.load.image(previewKey, previewImage);
  },
  drawPreview(scene, { width, height }) {
    return [scene.add.image(0, 0, previewKey).setOrigin(0).setDisplaySize(width, height)];
  },
};
