import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const pinkSkyOverJapanSource = staticImageSource({
  sceneKey: 'PinkSkyOverJapan',
  title: 'Pink Sky Over Japan',
  tags: { theme: 'City', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/traditional-japanese-building-under-pink-sky-gehScnDQEZ8',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'pink-sky-over-japan',
  artworkUrl,
  artworkSize: { width: 2000, height: 2667 },
  previewUrl,
});
