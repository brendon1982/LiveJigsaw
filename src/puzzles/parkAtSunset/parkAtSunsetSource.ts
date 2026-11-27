import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const parkAtSunsetSource = staticImageSource({
  sceneKey: 'ParkAtSunset',
  title: 'Park at Sunset',
  tags: { theme: 'City', type: 'Flat Illustration' },
  attribution: {
    name: 'Anu Priya',
    sourceUrl: 'https://unsplash.com/illustrations/person-on-park-bench-facing-building-zVKdmdFcGx8',
    artistUrl: 'https://unsplash.com/@nibkromos/illustrations',
  },
  artworkKey: 'park-at-sunset',
  artworkUrl,
  artworkSize: { width: 2000, height: 3303 },
  previewUrl,
});
