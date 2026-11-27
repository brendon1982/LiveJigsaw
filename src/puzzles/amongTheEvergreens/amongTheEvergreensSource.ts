import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const amongTheEvergreensSource = staticImageSource({
  sceneKey: 'AmongTheEvergreens',
  title: 'Among the Evergreens',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Naila Conita',
    sourceUrl: 'https://unsplash.com/illustrations/people-walking-among-evergreen-trees-Qqa_d9JFYqI',
    artistUrl: 'https://unsplash.com/@nailaconita',
  },
  artworkKey: 'among-the-evergreens',
  artworkUrl,
  artworkSize: { width: 2000, height: 2667 },
  previewUrl,
});
