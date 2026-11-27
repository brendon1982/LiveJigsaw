import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const riversideAtDuskSource = staticImageSource({
  sceneKey: 'RiversideAtDusk',
  title: 'Riverside at Dusk',
  tags: { theme: 'Sky', type: 'Flat Illustration' },
  attribution: {
    name: 'Anu Priya',
    sourceUrl: 'https://unsplash.com/illustrations/people-sitting-by-river-at-dusk-GLEGcLv0fg4',
    artistUrl: 'https://unsplash.com/@nibkromos/illustrations',
  },
  artworkKey: 'riverside-at-dusk',
  artworkUrl,
  artworkSize: { width: 2000, height: 3084 },
  previewUrl,
});
