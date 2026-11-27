import { puzzleCredits } from '../creditsCatalog';
import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import clouds from './assets/clouds.png';
import distantHills from './assets/distant-hills.png';
import candyGrove from './assets/candy-grove.png';
import candyGround from './assets/candy-ground.png';
import preview from './assets/preview.png';

export const peppermintGladeSource = parallaxSource({
  key: 'PeppermintGlade',
  title: 'Peppermint Glade',
  theme: 'Candy',
  attribution: puzzleCredits.craftpix,
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'clouds', url: clouds, travel: 0.006, anchorY: 0.5 },
    { name: 'distant-hills', url: distantHills, travel: 0.021 },
    { name: 'candy-grove', url: candyGrove, travel: 0.035 },
    { name: 'candy-ground', url: candyGround, travel: 0.05 },
  ],
});
