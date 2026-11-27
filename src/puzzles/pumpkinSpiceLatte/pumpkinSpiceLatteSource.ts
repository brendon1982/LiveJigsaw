import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const pumpkinSpiceLatteSource = staticImageSource({
  sceneKey: 'PumpkinSpiceLatte',
  title: 'Pumpkin Spice Latte',
  tags: { theme: 'Food', type: 'Flat Illustration' },
  attribution: {
    name: 'Allison Saeng',
    sourceUrl: 'https://unsplash.com/illustrations/pumpkin-spice-latte-illustration-_u2lciJs670',
    artistUrl: 'https://unsplash.com/@allisonsaeng',
  },
  artworkKey: 'pumpkin-spice-latte',
  artworkUrl,
  artworkSize: { width: 3556, height: 2000 },
  previewUrl,
});
