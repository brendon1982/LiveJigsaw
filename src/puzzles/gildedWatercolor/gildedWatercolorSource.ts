import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const gildedWatercolorSource = staticImageSource({
  sceneKey: 'GildedWatercolor',
  title: 'Gilded Watercolor',
  tags: { theme: 'Space', type: 'Flat Illustration' },
  attribution: {
    name: 'Anupa Paul',
    sourceUrl: 'https://unsplash.com/illustrations/blue-and-teal-watercolor-with-gold-KP10mGrTdO0',
    artistUrl: 'https://unsplash.com/@underthesky07/illustrations',
  },
  artworkKey: 'gilded-watercolor',
  artworkUrl,
  artworkSize: { width: 2000, height: 3000 },
  previewUrl,
});
