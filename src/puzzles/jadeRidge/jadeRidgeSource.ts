import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import celestialLight from './assets/celestial-light.png';
import distantLand from './assets/distant-land.png';
import middleLand from './assets/middle-land.png';
import nearLand from './assets/near-land.png';
import foreground from './assets/foreground.png';
import preview from './assets/preview.png';

export const jadeRidgeSource = parallaxSource({
  key: 'JadeRidge',
  title: 'Jade Ridge',
  theme: 'Mountains',
  preview,
  artworkSize: { width: 2019, height: 1020 },
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'celestial-light', url: celestialLight, travel: 0.002, anchorY: 0, seededX: { origin: 0.5, range: [0.14, 0.86] } },
    { name: 'distant-land', url: distantLand, travel: 0.017 },
    { name: 'middle-land', url: middleLand, travel: 0.028 },
    { name: 'near-land', url: nearLand, travel: 0.039, seededX: { origin: 0.5, range: [0.42, 0.58] } },
    { name: 'foreground', url: foreground, travel: 0.05 },
  ],
});
