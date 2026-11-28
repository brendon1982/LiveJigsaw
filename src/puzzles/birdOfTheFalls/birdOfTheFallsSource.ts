import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const birdOfTheFallsSource = staticImageSource({
  sceneKey: 'BirdOfTheFalls',
  title: 'Bird of the Falls',
  tags: { theme: 'Wildlife', type: 'Flat Illustration' },
  attribution: {
    name: 'Getty Images',
    sourceUrl: 'https://unsplash.com/illustrations/bird-and-waterfall-eps-8-file-format-15kx13wFt_k',
    artistUrl: 'https://unsplash.com/@gettyimages',
  },
  artworkKey: 'bird-of-the-falls',
  artworkUrl,
  artworkSize: { width: 2000, height: 2666 },
  previewUrl,
});