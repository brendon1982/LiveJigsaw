import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const dalaHorseChristmasSource = staticImageSource({
  sceneKey: 'DalaHorseChristmas',
  title: 'Dala Horse Christmas',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Sara Oliveira',
    sourceUrl: 'https://unsplash.com/illustrations/dala-horses-and-christmas-tree-illustration-BCZAsHjLpSw',
    artistUrl: 'https://unsplash.com/@shireillustrations/illustrations',
  },
  artworkKey: 'dala-horse-christmas',
  artworkUrl,
  artworkSize: { width: 3000, height: 2000 },
  previewUrl,
});
