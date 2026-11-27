import { staticImageSource } from '../staticImageSource';
import artworkUrl from './jungle-rhinos.png';
import previewUrl from './jungle-rhinos-preview.jpg';

export const jungleRhinosSource = staticImageSource({
  sceneKey: 'JungleRhinos',
  title: 'Jungle Rhinos',
  tags: { theme: 'Wildlife', type: 'Flat Illustration' },
  attribution: {
    name: 'Swipe 👋😍',
    sourceUrl: 'https://unsplash.com/illustrations/two-colorful-rhinos-surrounded-by-lush-jungle-foliage-and-butterflies-9-I3zO9WM50',
    artistUrl: 'https://unsplash.com/@swipe9/illustrations',
  },
  artworkKey: 'jungle-rhinos',
  artworkUrl,
  artworkSize: { width: 2000, height: 2000 },
  previewUrl,
});