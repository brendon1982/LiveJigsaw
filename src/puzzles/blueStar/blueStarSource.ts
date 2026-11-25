import { parallaxSource } from '../parallax/parallaxSource';
import nebula from './assets/nebula.png';
import stars from './assets/stars.png';
import planet from './assets/planet.png';
import blueStar from './assets/blue-star.png';
import preview from './assets/preview.png';

export const blueStarSource = parallaxSource({
  key: 'BlueStar',
  title: 'Blue Star',
  preview,
  layers: [
    { name: 'nebula', url: nebula, travel: 0, anchorY: 0.5 },
    { name: 'stars', url: stars, travel: 0.002, anchorY: 0.5, seededX: { origin: 0.5, range: [0.4, 0.6] } },
    { name: 'planet', url: planet, travel: 0.028, anchorY: 0.5, seededX: { origin: 0.253, range: [0.11, 0.75] } },
    { name: 'blue-star', url: blueStar, travel: 0.003, seededX: { origin: 0.733, range: [0.34, 0.92] } },
  ],
});
