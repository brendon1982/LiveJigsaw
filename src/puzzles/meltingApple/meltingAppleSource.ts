import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const meltingAppleSource = staticImageSource({
  sceneKey: 'MeltingApple',
  title: 'Melting Apple',
  tags: { theme: 'Food', type: 'Flat Illustration' },
  attribution: {
    name: 'Floptimista',
    sourceUrl: 'https://unsplash.com/illustrations/melting-red-apple-character-illustration-OexapbR4oww',
    artistUrl: 'https://unsplash.com/@floptimista/illustrations',
  },
  artworkKey: 'melting-apple',
  artworkUrl,
  artworkSize: { width: 2000, height: 2072 },
  previewUrl,
  backgroundColor: 0xffffff,
});
