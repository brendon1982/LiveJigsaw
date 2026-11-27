import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const starburstSantaSource = staticImageSource({
  sceneKey: 'StarburstSanta',
  title: 'Starburst Santa',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'barsrsind',
    sourceUrl: 'https://unsplash.com/illustrations/santa-claus-illustration-with-starbursts-ecYiNOo3DTk',
    artistUrl: 'https://unsplash.com/@barsrsind/illustrations',
  },
  artworkKey: 'starburst-santa',
  artworkUrl,
  artworkSize: { width: 2500, height: 2000 },
  previewUrl,
});
