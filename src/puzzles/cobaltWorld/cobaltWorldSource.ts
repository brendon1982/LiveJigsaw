import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import ringedPlanet from './assets/ringed-planet.png';
import distantCorals from './assets/distant-corals.png';
import crystalRidge from './assets/crystal-ridge.png';
import nearCrystals from './assets/near-crystals.png';
import ground from './assets/ground.png';
import preview from './assets/preview.png';

export const cobaltWorldSource = parallaxSource({
  key: 'CobaltWorld',
  title: 'Cobalt World',
  theme: 'Alien Worlds',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'ringed-planet', url: ringedPlanet, travel: 0.006 },
    { name: 'distant-corals', url: distantCorals, travel: 0.017 },
    { name: 'crystal-ridge', url: crystalRidge, travel: 0.028 },
    { name: 'near-crystals', url: nearCrystals, travel: 0.039 },
    { name: 'ground', url: ground, travel: 0.05 },
  ],
});
