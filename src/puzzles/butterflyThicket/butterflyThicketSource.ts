import { puzzleCredits } from '../creditsCatalog';
import { fullCanvasParallaxSource } from '../parallax/fullCanvasParallaxSource';
import preview from './assets/preview.jpg';

export const butterflyThicketSource = fullCanvasParallaxSource({
  key: 'ButterflyThicket', title: 'Butterfly Thicket', theme: 'Woodland', attribution: puzzleCredits.craftpix, preview,
  layerUrls: import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url', import: 'default' }),
});