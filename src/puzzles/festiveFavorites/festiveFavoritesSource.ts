import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const festiveFavoritesSource = staticImageSource({
  sceneKey: 'FestiveFavorites',
  title: 'Festive Favorites',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Anu Priya',
    sourceUrl: 'https://unsplash.com/illustrations/santa-claus-and-festive-holiday-icons-F2Wd6sIZOF4',
    artistUrl: 'https://unsplash.com/@nibkromos/illustrations',
  },
  artworkKey: 'festive-favorites',
  artworkUrl,
  artworkSize: { width: 3021, height: 2000 },
  previewUrl,
});
