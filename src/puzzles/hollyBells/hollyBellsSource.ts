import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const hollyBellsSource = staticImageSource({
  sceneKey: 'HollyBells',
  title: 'Holly Bells',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/red-christmas-bells-with-holly-p0mw-9ITQAI',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'holly-bells',
  artworkUrl,
  artworkSize: { width: 2000, height: 2667 },
  previewUrl,
});
