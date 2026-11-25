import { parallaxSource } from '../parallax/parallaxSource';
import cactus from './assets/cactus.png';
import clouds from './assets/clouds.png';
import dust from './assets/dust.png';
import fog from './assets/fog.png';
import ground from './assets/ground.png';
import distantMesas from './assets/mountains-bg.png';
import foothills from './assets/mountains-fg.png';
import preview from './assets/preview.png';
import sky from './assets/sky.png';

export const canyonDriftSource = parallaxSource({
  key: 'CanyonDrift',
  title: 'Canyon Drift',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0 },
    { name: 'dust', url: dust, travel: 0.006 },
    { name: 'distant-mesas', url: distantMesas, travel: 0.012 },
    { name: 'foothills', url: foothills, travel: 0.025 },
    { name: 'fog', url: fog, travel: 0.018 },
    { name: 'clouds', url: clouds, travel: 0.008 },
    { name: 'ground', url: ground, travel: 0.036 },
    { name: 'cactus', url: cactus, travel: 0.05, seededX: { origin: 0.711 } },
  ],
});
