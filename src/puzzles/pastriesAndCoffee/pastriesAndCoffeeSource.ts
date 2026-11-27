import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const pastriesAndCoffeeSource = staticImageSource({
  sceneKey: 'PastriesAndCoffee',
  title: 'Pastries and Coffee',
  tags: { theme: 'Food', type: 'Flat Illustration' },
  attribution: {
    name: 'Kamara Rahmat',
    sourceUrl: 'https://unsplash.com/illustrations/pastries-and-cakes-with-coffee-cup-s5gVLLRFpsY',
    artistUrl: 'https://unsplash.com/@iyaniyan/illustrations',
  },
  artworkKey: 'pastries-and-coffee',
  artworkUrl,
  artworkSize: { width: 2000, height: 2675 },
  previewUrl,
});
