import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import clouds from './assets/clouds.png';
import candyGrove from './assets/candy-grove.png';
import distantHills from './assets/distant-hills.png';
import candyGround from './assets/candy-ground.png';
import preview from './assets/preview.png';

export const cupcakeCrossingSource = parallaxSource({
  key: 'CupcakeCrossing',
  title: 'Cupcake Crossing',
  theme: 'Candy',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'clouds', url: clouds, travel: 0.006, anchorY: 0.5, seededX: { origin: 0.5, range: [0.28, 0.72] } },
    { name: 'candy-grove', url: candyGrove, travel: 0.021 },
    { name: 'distant-hills', url: distantHills, travel: 0.035 },
    { name: 'candy-ground', url: candyGround, travel: 0.05 },
  ],
});
