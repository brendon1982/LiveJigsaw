import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import clouds from './assets/clouds.png';
import surfaceWater from './assets/surface-water.png';
import distantSeabed from './assets/distant-seabed.png';
import nearSeabed from './assets/near-seabed.png';
import fish from './assets/fish.png';
import reefDetail from './assets/reef-detail.png';
import reefFloor from './assets/reef-floor.png';
import preview from './assets/preview.png';

export const coralGardenSource = parallaxSource({
  key: 'CoralGarden',
  title: 'Coral Garden',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'clouds', url: clouds, travel: 0.008, anchorY: 0.5 },
    { name: 'surface-water', url: surfaceWater, travel: 0.012 },
    { name: 'distant-seabed', url: distantSeabed, travel: 0.018 },
    { name: 'near-seabed', url: nearSeabed, travel: 0.024 },
    { name: 'fish', url: fish, travel: 0.032, seededX: { origin: 0.5, range: [0.38, 0.62] } },
    { name: 'reef-detail', url: reefDetail, travel: 0.04, seededX: { origin: 0.5, range: [0.44, 0.56] } },
    { name: 'reef-floor', url: reefFloor, travel: 0.05 },
  ],
});
