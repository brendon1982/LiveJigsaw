import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const pinkDragonSource = staticImageSource({
  sceneKey: 'PinkDragon',
  title: 'Pink Dragon',
  tags: { theme: 'Medieval', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/child-sitting-on-pink-dragon-8Ay79_RI4Qo',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'pink-dragon',
  artworkUrl,
  artworkSize: { width: 3002, height: 2000 },
  previewUrl,
});
