import { imagePreview } from '../imagePreview';
import type { PuzzleSource } from '../PuzzleSource';
import { MedievalVillageScene } from './MedievalVillageScene';
import previewImage from './assets/preview.png';

export const medievalVillageSource: PuzzleSource = {
  title: 'Medieval Village',
  maxViewport: { width: 1024, height: 576 },
  scene: MedievalVillageScene,
  ...imagePreview('medieval-village-preview', previewImage),
};
