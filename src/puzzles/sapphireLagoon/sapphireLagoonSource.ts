import { puzzleCredits } from '../creditsCatalog';
import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import clouds from './assets/clouds.png';
import surfaceWater from './assets/surface-water.png';
import distantSeabed from './assets/distant-seabed.png';
import nearSeabed from './assets/near-seabed.png';
import reefDetail from './assets/reef-detail.png';
import fish from './assets/fish.png';
import reefFloor from './assets/reef-floor.png';
import preview from './assets/preview.png';

export const sapphireLagoonSource = parallaxSource({
  key: 'SapphireLagoon',
  title: 'Sapphire Lagoon',
  theme: 'Ocean',
  attribution: puzzleCredits.craftpix,
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'clouds', url: clouds, travel: 0.008, anchorY: 0.5 },
    { name: 'surface-water', url: surfaceWater, travel: 0.012 },
    { name: 'distant-seabed', url: distantSeabed, travel: 0.018 },
    { name: 'near-seabed', url: nearSeabed, travel: 0.024 },
    { name: 'reef-detail', url: reefDetail, travel: 0.04, seededX: { origin: 0.5, range: [0.41, 0.59] } },
    { name: 'fish', url: fish, travel: 0.032, seededX: { origin: 0.5, range: [0.34, 0.66] } },
    { name: 'reef-floor', url: reefFloor, travel: 0.05 },
  ],
});
