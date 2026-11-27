import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const oceanLinerSource = staticImageSource({
  sceneKey: 'OceanLiner',
  title: 'Ocean Liner',
  tags: { theme: 'Ocean', type: 'Flat Illustration' },
  attribution: {
    name: 'Steve Dunlop',
    sourceUrl: 'https://unsplash.com/illustrations/ocean-liner-passing-small-sailboat-t47dp40w_gs',
    artistUrl: 'https://unsplash.com/@stevedunlopart/illustrations',
  },
  artworkKey: 'ocean-liner',
  artworkUrl,
  artworkSize: { width: 2000, height: 2444 },
  previewUrl,
});
