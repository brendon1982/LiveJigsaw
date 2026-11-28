import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const catfaceSource = staticImageSource({
  sceneKey: 'YellowEyedCat',
  title: 'Catface',
  tags: { theme: 'Pets', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/grey-cat-with-yellow-eyes-and-whiskers-31QPep21jpc',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'yellow-eyed-cat',
  artworkUrl,
  artworkSize: { width: 2667, height: 2000 },
  previewUrl,
});
