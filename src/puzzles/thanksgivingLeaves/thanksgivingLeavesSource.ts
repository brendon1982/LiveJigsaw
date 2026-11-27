import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const thanksgivingLeavesSource = staticImageSource({
  sceneKey: 'ThanksgivingLeaves',
  title: 'Thanksgiving Leaves',
  tags: { theme: 'Woodland', type: 'Flat Illustration' },
  attribution: {
    name: 'Md Ekram',
    sourceUrl: 'https://unsplash.com/illustrations/happy-thanksgiving-autumn-leaves-illustration-Ifsvk6h-WKM',
    artistUrl: 'https://unsplash.com/@ekram68/illustrations',
  },
  artworkKey: 'thanksgiving-leaves',
  artworkUrl,
  artworkSize: { width: 2000, height: 2572 },
  previewUrl,
});
