import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import fieryClouds from './assets/fiery-clouds.png';
import orbitalPlanets from './assets/orbital-planets.png';
import distantCrags from './assets/distant-crags.png';
import emberCrags from './assets/ember-crags.png';
import ground from './assets/ground.png';
import preview from './assets/preview.png';

export const emberworldSource = parallaxSource({
  key: 'Emberworld',
  title: 'Emberworld',
  theme: 'Alien Worlds',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'fiery-clouds', url: fieryClouds, travel: 0.006, anchorY: 0.5 },
    { name: 'orbital-planets', url: orbitalPlanets, travel: 0.002, anchorY: 0.5, seededX: { origin: 0.5, range: [0.35, 0.65] } },
    { name: 'distant-crags', url: distantCrags, travel: 0.028 },
    { name: 'ember-crags', url: emberCrags, travel: 0.039 },
    { name: 'ground', url: ground, travel: 0.05 },
  ],
});
