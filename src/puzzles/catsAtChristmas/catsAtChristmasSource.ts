import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const catsAtChristmasSource = staticImageSource({
  sceneKey: 'CatsAtChristmas',
  title: 'Cats at Christmas',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/two-cats-by-christmas-tree-HUP5tlDJ4UI',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'cats-at-christmas',
  artworkUrl,
  artworkSize: { width: 3000, height: 2000 },
  previewUrl,
});
