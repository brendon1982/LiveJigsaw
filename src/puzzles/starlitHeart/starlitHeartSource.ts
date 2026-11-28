import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const starlitHeartSource = staticImageSource({
  sceneKey: 'StarlitHeart',
  title: 'Starlit Heart',
  tags: { theme: 'Countryside', type: 'Flat Illustration' },
  attribution: {
    name: 'Migrastar',
    sourceUrl: 'https://unsplash.com/illustrations/a-heart-shaped-pond-in-a-field-under-a-starry-sky-53U77XWG7IE',
    artistUrl: 'https://unsplash.com/@migrastar/illustrations',
  },
  artworkKey: 'starlit-heart',
  artworkUrl,
  artworkSize: { width: 2000, height: 1500 },
  previewUrl,
});