import { puzzleCredits } from '../creditsCatalog';
import { fullCanvasParallaxSource } from '../parallax/fullCanvasParallaxSource';
import preview from './assets/preview.jpg';

export const snowboundPinesSource = fullCanvasParallaxSource({
  key: 'SnowboundPines', title: 'Snowbound Pines', theme: 'Woodland', attribution: puzzleCredits.craftpix, preview,
  layerUrls: import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url', import: 'default' }),
});