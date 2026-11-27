import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const adriftInDreamsSource = staticImageSource({
  sceneKey: 'AdriftInDreams',
  title: 'Adrift in Dreams',
  tags: { theme: 'Ocean', type: 'Flat Illustration' },
  attribution: {
    name: 'Kyunghee Yim',
    sourceUrl: 'https://unsplash.com/illustrations/person-sleeping-in-bed-on-sea-WWKxGhN5xQw',
    artistUrl: 'https://unsplash.com/@isaedesk/illustrations',
  },
  artworkKey: 'adrift-in-dreams',
  artworkUrl,
  artworkSize: { width: 2000, height: 2834 },
  previewUrl,
});
