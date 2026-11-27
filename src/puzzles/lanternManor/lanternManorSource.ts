import { puzzleCredits } from '../creditsCatalog';
import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import clouds from './assets/clouds.png';
import cloudedHills from './assets/clouded-hills.png';
import distantRuins from './assets/distant-ruins.png';
import lanternPath from './assets/lantern-path.png';
import manor from './assets/manor.png';
import ground from './assets/ground.png';
import preview from './assets/preview.png';

export const lanternManorSource = parallaxSource({
  key: 'LanternManor',
  title: 'Lantern Manor',
  theme: 'Halloween',
  attribution: puzzleCredits.craftpix,
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'clouds', url: clouds, travel: 0.006, anchorY: 0.5 },
    { name: 'clouded-hills', url: cloudedHills, travel: 0.015, anchorY: 0.5 },
    { name: 'distant-ruins', url: distantRuins, travel: 0.024 },
    { name: 'lantern-path', url: lanternPath, travel: 0.032 },
    { name: 'manor', url: manor, travel: 0.041, seededX: { origin: 0.23, range: [0.16, 0.41] } },
    { name: 'ground', url: ground, travel: 0.05 },
  ],
});
