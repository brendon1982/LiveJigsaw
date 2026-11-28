import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const alpenglowReflectionsSource = staticImageSource({
  sceneKey: 'AlpenglowReflections',
  title: 'Alpenglow Reflections',
  tags: { theme: 'Mountains', type: 'Flat Illustration' },
  attribution: {
    name: 'the iop',
    sourceUrl: 'https://unsplash.com/illustrations/mountain-landscape-reflected-in-a-lake-at-sunset-gSNUf4tJWkM',
    artistUrl: 'https://unsplash.com/@the_iop/illustrations',
  },
  artworkKey: 'alpenglow-reflections',
  artworkUrl,
  artworkSize: { width: 2000, height: 2981 },
  previewUrl,
  backgroundColor: 0xffffff,
});