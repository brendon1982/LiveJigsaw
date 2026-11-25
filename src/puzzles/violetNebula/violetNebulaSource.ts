import { parallaxSource } from '../parallax/parallaxSource';
import nebula from './assets/nebula.png';
import stars from './assets/stars.png';
import planet from './assets/planet.png';
import preview from './assets/preview.png';

export const violetNebulaSource = parallaxSource({
  key: 'VioletNebula',
  title: 'Violet Nebula',
  preview,
  layers: [
    { name: 'nebula', url: nebula, travel: 0, anchorY: 0.5 },
    { name: 'stars', url: stars, travel: 0.002, anchorY: 0.5, seededX: { origin: 0.5, range: [0.4, 0.6] } },
    { name: 'planet', url: planet, travel: 0.05, anchorY: 0.5, seededX: { origin: 0.213, range: [0.12, 0.88] } },
  ],
});
