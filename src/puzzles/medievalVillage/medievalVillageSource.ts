import type { PuzzleSource } from '../PuzzleSource';
import { MedievalVillageScene } from './MedievalVillageScene';
import previewImage from './assets/preview.png';

const previewKey = 'medieval-village-preview';

export const medievalVillageSource: PuzzleSource = {
  title: 'Medieval Village',
  maxViewport: { width: 1024, height: 576 },
  scene: MedievalVillageScene,
  preloadPreview(scene) {
    if (!scene.textures.exists(previewKey)) scene.load.image(previewKey, previewImage);
  },
  drawPreview(scene, { width, height }) {
    return [scene.add.image(0, 0, previewKey).setOrigin(0).setDisplaySize(width, height)];
  },
};
