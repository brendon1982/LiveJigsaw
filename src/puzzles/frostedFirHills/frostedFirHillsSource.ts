import { puzzleCredits } from '../creditsCatalog';
import { fullCanvasParallaxSource } from '../parallax/fullCanvasParallaxSource';
import preview from './assets/preview.jpg';

export const frostedFirHillsSource = fullCanvasParallaxSource({
  key: 'FrostedFirHills', title: 'Frosted Fir Hills', theme: 'Candy', attribution: puzzleCredits.craftpix, preview,
  layerUrls: import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url', import: 'default' }),
});