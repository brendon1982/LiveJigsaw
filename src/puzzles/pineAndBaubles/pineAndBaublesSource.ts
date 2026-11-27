import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const pineAndBaublesSource = staticImageSource({
  sceneKey: 'PineAndBaubles',
  title: 'Pine and Baubles',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/christmas-ornaments-on-pine-tree-NLNdHrnmeYA',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'pine-and-baubles',
  artworkUrl,
  artworkSize: { width: 2000, height: 2667 },
  previewUrl,
});
