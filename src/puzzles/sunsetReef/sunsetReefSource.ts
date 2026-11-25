import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import sun from './assets/sun.png';
import clouds from './assets/clouds.png';
import surfaceWater from './assets/surface-water.png';
import distantSeabed from './assets/distant-seabed.png';
import nearSeabed from './assets/near-seabed.png';
import reefDetail from './assets/reef-detail.png';
import reefFloor from './assets/reef-floor.png';
import fish from './assets/fish.png';
import preview from './assets/preview.png';

export const sunsetReefSource = parallaxSource({
  key: 'SunsetReef',
  title: 'Sunset Reef',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'sun', url: sun, travel: 0.002, anchorY: 0.5, seededX: { origin: 0.218, range: [0.08, 0.92] } },
    { name: 'clouds', url: clouds, travel: 0.008, anchorY: 0.5 },
    { name: 'surface-water', url: surfaceWater, travel: 0.012 },
    { name: 'distant-seabed', url: distantSeabed, travel: 0.018 },
    { name: 'near-seabed', url: nearSeabed, travel: 0.024 },
    { name: 'reef-detail', url: reefDetail, travel: 0.04, seededX: { origin: 0.44, range: [0.27, 0.67] } },
    { name: 'reef-floor', url: reefFloor, travel: 0.05 },
    { name: 'fish', url: fish, travel: 0.032, seededX: { origin: 0.5, range: [0.36, 0.64] } },
  ],
});
