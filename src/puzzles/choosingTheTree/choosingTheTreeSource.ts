import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const choosingTheTreeSource = staticImageSource({
  sceneKey: 'ChoosingTheTree',
  title: 'Choosing the Tree',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/adult-and-child-choosing-christmas-tree-YcQCCYCzZKg',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'choosing-the-tree',
  artworkUrl,
  artworkSize: { width: 3000, height: 2000 },
  previewUrl,
});
