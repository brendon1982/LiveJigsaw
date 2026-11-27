import { puzzleCredits } from '../creditsCatalog';
import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/7.png';
import mist from './assets/6.png';
import distantCanopy from './assets/5.png';
import distantBirches from './assets/4.png';
import mistyBirches from './assets/3.png';
import nearBirches from './assets/2.png';
import meadow from './assets/1.png';
import preview from './assets/preview.png';

export const birchGladeSource = parallaxSource({
  key: 'BirchGlade',
  title: 'Birch Glade',
  theme: 'Woodland',
  attribution: puzzleCredits.craftpix,
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'mist', url: mist, travel: 0.006, anchorY: 0.5, seededX: { origin: 0.5, range: [0.4, 0.6] } },
    { name: 'distant-canopy', url: distantCanopy, travel: 0.012, anchorY: 0.5 },
    { name: 'distant-birches', url: distantBirches, travel: 0.02, anchorY: 0.5 },
    { name: 'misty-birches', url: mistyBirches, travel: 0.031 },
    { name: 'near-birches', url: nearBirches, travel: 0.04 },
    { name: 'meadow', url: meadow, travel: 0.05 },
  ],
});
