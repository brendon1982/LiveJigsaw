import { parallaxSource } from '../parallax/parallaxSource';
import nearCloud from './assets/cloud-fg.png';
import distantClouds from './assets/clouds-bg.png';
import fog from './assets/fog.png';
import ground from './assets/ground.png';
import distantMesas from './assets/mountains-bg.png';
import foothills from './assets/mountains-fg.png';
import middleMesas from './assets/mountains-mg.png';
import preview from './assets/preview.png';
import sky from './assets/sky.png';
import sun from './assets/sun.png';

export const emberMesaSource = parallaxSource({
  key: 'EmberMesa',
  title: 'Ember Mesa',
  theme: 'Desert',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0 },
    { name: 'distant-clouds', url: distantClouds, travel: 0.005, anchorY: 0 },
    { name: 'sun', url: sun, travel: 0.002, anchorY: 0.33, seededX: { origin: 0.336, range: [0, 1] } },
    { name: 'near-cloud', url: nearCloud, travel: 0.008 },
    { name: 'distant-mesas', url: distantMesas, travel: 0.012, anchorY: 0.52 },
    { name: 'middle-mesas', url: middleMesas, travel: 0.022, anchorY: 0.73 },
    { name: 'fog', url: fog, travel: 0.017, anchorY: 0.73 },
    { name: 'foothills', url: foothills, travel: 0.036 },
    { name: 'ground', url: ground, travel: 0.05 },
  ],
});
