import { parallaxSource } from '../parallax/parallaxSource';
import air from './assets/air.png';
import distantClouds from './assets/clouds-bg.png';
import nearClouds from './assets/clouds-fg.png';
import ground from './assets/ground.png';
import distantMountains from './assets/mountains-bg.png';
import foothills from './assets/mountains-fg.png';
import middleMountains from './assets/mountains-mg.png';
import preview from './assets/preview.png';
import sky from './assets/sky.png';
import stars from './assets/stars.png';
import tree from './assets/tree.png';

export const twilightRidgeSource = parallaxSource({
  key: 'TwilightRidge',
  title: 'Twilight Ridge',
  theme: 'Mountains',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0 },
    { name: 'stars', url: stars, travel: 0, anchorY: 0, seededX: { origin: 0.5, range: [0.37, 0.63] } },
    { name: 'distant-clouds', url: distantClouds, travel: 0.005 },
    { name: 'distant-mountains', url: distantMountains, travel: 0.012 },
    { name: 'near-clouds', url: nearClouds, travel: 0.009 },
    { name: 'middle-mountains', url: middleMountains, travel: 0.02 },
    { name: 'foothills', url: foothills, travel: 0.028 },
    { name: 'air', url: air, travel: 0.013 },
    { name: 'ground', url: ground, travel: 0.039 },
    { name: 'tree', url: tree, travel: 0.05, seededX: { origin: 0.683 } },
  ],
});
