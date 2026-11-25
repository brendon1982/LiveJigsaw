import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import orbitalPlanets from './assets/orbital-planets.png';
import distantHaze from './assets/distant-haze.png';
import alienTowers from './assets/alien-towers.png';
import opalSpires from './assets/opal-spires.png';
import ground from './assets/ground.png';
import preview from './assets/preview.png';

export const opalPlanetSource = parallaxSource({
  key: 'OpalPlanet',
  title: 'Opal Planet',
  theme: 'Alien Worlds',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'orbital-planets', url: orbitalPlanets, travel: 0.002, anchorY: 0.5, seededX: { origin: 0.5, range: [0.34, 0.66] } },
    { name: 'distant-haze', url: distantHaze, travel: 0.017 },
    { name: 'alien-towers', url: alienTowers, travel: 0.028 },
    { name: 'opal-spires', url: opalSpires, travel: 0.039 },
    { name: 'ground', url: ground, travel: 0.05 },
  ],
});
