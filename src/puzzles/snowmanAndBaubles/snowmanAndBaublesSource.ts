import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const snowmanAndBaublesSource = staticImageSource({
  sceneKey: 'SnowmanAndBaubles',
  title: 'Snowman and Baubles',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Kyunghee Yim',
    sourceUrl: 'https://unsplash.com/illustrations/snowman-looking-at-christmas-ornaments-JyzM9kNlKus',
    artistUrl: 'https://unsplash.com/@isaedesk/illustrations',
  },
  artworkKey: 'snowman-and-baubles',
  artworkUrl,
  artworkSize: { width: 2000, height: 2834 },
  previewUrl,
});
