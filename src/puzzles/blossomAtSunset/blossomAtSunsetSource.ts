import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const blossomAtSunsetSource = staticImageSource({
  sceneKey: 'BlossomAtSunset',
  title: 'Blossom at Sunset',
  tags: { theme: 'Flowers', type: 'Flat Illustration' },
  attribution: {
    name: 'SERAFINA SEELY',
    sourceUrl: 'https://unsplash.com/illustrations/a-stylized-tree-with-pink-blossoms-against-a-sunset-CAasUDXd1R0',
    artistUrl: 'https://unsplash.com/@vanillaraptor/illustrations',
  },
  artworkKey: 'blossom-at-sunset',
  artworkUrl,
  artworkSize: { width: 2000, height: 1666 },
  previewUrl,
  backgroundColor: 0xffffff,
});