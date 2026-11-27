import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const christmasTreeFarmSource = staticImageSource({
  sceneKey: 'ChristmasTreeFarm',
  title: 'Christmas Tree Farm',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Naila Conita',
    sourceUrl: 'https://unsplash.com/illustrations/people-at-christmas-tree-farm-entrance-z8gVPlloPy0',
    artistUrl: 'https://unsplash.com/@nailaconita',
  },
  artworkKey: 'christmas-tree-farm',
  artworkUrl,
  artworkSize: { width: 2000, height: 2667 },
  previewUrl,
});
