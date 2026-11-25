import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import distantRidges from './assets/distant-ridges.png';
import distantLand from './assets/distant-land.png';
import middleLand from './assets/middle-land.png';
import nearLand from './assets/near-land.png';
import foreground from './assets/foreground.png';
import preview from './assets/preview.png';

export const spireCountrySource = parallaxSource({
  key: 'SpireCountry',
  title: 'Spire Country',
  preview,
  artworkSize: { width: 2019, height: 1020 },
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'distant-ridges', url: distantRidges, travel: 0.006 },
    { name: 'distant-land', url: distantLand, travel: 0.017, seededX: { origin: 0.5, range: [0.41, 0.59] } },
    { name: 'middle-land', url: middleLand, travel: 0.028, seededX: { origin: 0.5, range: [0.37, 0.63] } },
    { name: 'near-land', url: nearLand, travel: 0.039, seededX: { origin: 0.5, range: [0.44, 0.56] } },
    { name: 'foreground', url: foreground, travel: 0.05 },
  ],
});
