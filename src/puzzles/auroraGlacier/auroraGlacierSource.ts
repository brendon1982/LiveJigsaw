import { puzzleCredits } from '../creditsCatalog';
import { fullCanvasParallaxSource } from '../parallax/fullCanvasParallaxSource';
import preview from './assets/preview.jpg';

export const auroraGlacierSource = fullCanvasParallaxSource({
  key: 'AuroraGlacier', title: 'Aurora Glacier', theme: 'Alien Worlds', attribution: puzzleCredits.craftpix, preview,
  layerUrls: import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url', import: 'default' }),
});