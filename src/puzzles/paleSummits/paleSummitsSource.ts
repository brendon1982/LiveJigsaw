import { puzzleCredits } from '../creditsCatalog';
import { fullCanvasParallaxSource } from '../parallax/fullCanvasParallaxSource';
import preview from './assets/preview.jpg';

export const paleSummitsSource = fullCanvasParallaxSource({
  key: 'PaleSummits', title: 'Pale Summits', theme: 'Mountains', attribution: puzzleCredits.craftpix, preview,
  layerUrls: import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url', import: 'default' }),
});