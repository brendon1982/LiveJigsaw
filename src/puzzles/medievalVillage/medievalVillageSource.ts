import { puzzleCredits } from '../creditsCatalog';
import { imagePreview } from '../imagePreview';
import type { PuzzleSource } from '../PuzzleSource';
import { MedievalVillageScene } from './MedievalVillageScene';
import previewImage from './assets/preview.png';

export const medievalVillageSource: PuzzleSource = {
  title: 'Medieval Village',
  tags: { theme: 'Medieval', type: 'Procedural' },
  attribution: puzzleCredits.kenney,
  maxViewport: { width: 1920, height: 1080 },
  scene: MedievalVillageScene,
  ...imagePreview('medieval-village-preview', previewImage),
};
