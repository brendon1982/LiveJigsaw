import { puzzleCredits } from '../creditsCatalog';
import { fullCanvasParallaxSource } from '../parallax/fullCanvasParallaxSource';
import preview from './assets/preview.jpg';

export const windcarvedDunesSource = fullCanvasParallaxSource({
  key: 'WindcarvedDunes', title: 'Windcarved Dunes', theme: 'Desert', attribution: puzzleCredits.craftpix, preview,
  layerUrls: import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url', import: 'default' }),
});