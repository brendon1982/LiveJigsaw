import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const lemonStripesSource = staticImageSource({
  sceneKey: 'LemonStripes',
  title: 'Lemon Stripes',
  tags: { theme: 'Food', type: 'Flat Illustration' },
  attribution: {
    name: 'Pixeliota',
    sourceUrl: 'https://unsplash.com/illustrations/yellow-lemons-on-striped-background-hyiuRY67a6U',
    artistUrl: 'https://unsplash.com/@pixeliota/illustrations',
  },
  artworkKey: 'lemon-stripes',
  artworkUrl,
  artworkSize: { width: 2000, height: 2500 },
  previewUrl,
});
