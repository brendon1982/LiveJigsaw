import { parallaxSource } from '../parallax/parallaxSource';
import nebula from './assets/nebula.png';
import stars from './assets/stars.png';
import bluePlanet from './assets/blue-planet.png';
import companionPlanet from './assets/companion-planet.png';
import preview from './assets/preview.png';

export const twinPlanetsSource = parallaxSource({
  key: 'TwinPlanets',
  title: 'Twin Planets',
  preview,
  layers: [
    { name: 'nebula', url: nebula, travel: 0, anchorY: 0.5 },
    { name: 'stars', url: stars, travel: 0.002, anchorY: 0.5, seededX: { origin: 0.5, range: [0.4, 0.6] } },
    { name: 'blue-planet', url: bluePlanet, travel: 0.028, anchorY: 0.5, seededX: { origin: 0.324, range: [0.28, 0.77] } },
    { name: 'companion-planet', url: companionPlanet, travel: 0.05, anchorY: 0.5, seededX: { origin: 0.25, range: [0.12, 0.7] } },
  ],
});
