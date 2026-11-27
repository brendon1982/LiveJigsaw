import { staticImageSource } from '../staticImageSource';
import artworkUrl from './cherry-blossoms-on-branch.png';

export const cherryBlossomsSource = staticImageSource({
  sceneKey: 'CherryBlossoms',
  title: 'Cherry Blossoms',
  tags: { theme: 'Flowers', type: 'Flat Illustration' },
  attribution: {
    name: 'Umme Hani Ali',
    sourceUrl: 'https://unsplash.com/illustrations/pink-cherry-blossoms-on-branch--a5OyxkF24g',
    artistUrl: 'https://unsplash.com/@ummehaniali_22/illustrations',
  },
  artworkKey: 'cherry-blossoms-on-branch',
  artworkUrl,
  artworkSize: { width: 1200, height: 1897 },
});