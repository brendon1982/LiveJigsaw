import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const folkArtChristmasTreeSource = staticImageSource({
  sceneKey: 'FolkArtChristmasTree',
  title: 'Folk Art Christmas Tree',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/folk-art-christmas-tree-illustration-2Q4GUNelC5w',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'folk-art-christmas-tree',
  artworkUrl,
  artworkSize: { width: 2000, height: 2667 },
  previewUrl,
});
