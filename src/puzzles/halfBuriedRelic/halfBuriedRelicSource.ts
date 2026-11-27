import { puzzleCredits } from '../creditsCatalog';
import { fullCanvasParallaxSource } from '../parallax/fullCanvasParallaxSource';
import preview from './assets/preview.jpg';

export const halfBuriedRelicSource = fullCanvasParallaxSource({
  key: 'HalfBuriedRelic', title: 'Half-Buried Relic', theme: 'Desert', attribution: puzzleCredits.craftpix, preview,
  layerUrls: import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url', import: 'default' }),
});