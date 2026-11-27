import { staticImageSource } from '../staticImageSource';
import artworkUrl from './gray-panther.png';

export const grayPantherSource = staticImageSource({
  sceneKey: 'GrayPanther',
  title: 'Gray Panther',
  tags: { theme: 'Wildlife', type: 'Flat Illustration' },
  attribution: {
    name: 'Swipe 👋😍',
    sourceUrl: 'https://unsplash.com/illustrations/a-stylized-grayscale-panther-sits-against-an-abstract-gray-background-gSR-qSYfJmc',
    artistUrl: 'https://unsplash.com/@swipe9/illustrations',
  },
  artworkKey: 'gray-panther',
  artworkUrl,
  artworkSize: { width: 2000, height: 2834 },
});