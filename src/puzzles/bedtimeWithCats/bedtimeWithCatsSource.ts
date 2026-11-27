import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const bedtimeWithCatsSource = staticImageSource({
  sceneKey: 'BedtimeWithCats',
  title: 'Bedtime with Cats',
  tags: { theme: 'Animals', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/a-woman-laying-on-a-bed-with-a-cat-HnfZmjCspAE',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'bedtime-with-cats',
  artworkUrl,
  artworkSize: { width: 2000, height: 2667 },
  previewUrl,
});
