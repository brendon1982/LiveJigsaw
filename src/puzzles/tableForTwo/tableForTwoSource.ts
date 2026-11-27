import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const tableForTwoSource = staticImageSource({
  sceneKey: 'TableForTwo',
  title: 'Table for Two',
  tags: { theme: 'Food', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/a-painting-of-a-table-with-plates-of-food-on-it-85DOiy2aMDA',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'table-for-two',
  artworkUrl,
  artworkSize: { width: 2000, height: 2667 },
  previewUrl,
});
