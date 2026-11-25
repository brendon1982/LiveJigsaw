import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/7.png';
import distantPines from './assets/6.png';
import pineGrove from './assets/5.png';
import middlePines from './assets/4.png';
import fallenLog from './assets/3.png';
import nearPines from './assets/2.png';
import forestFloor from './assets/1.png';
import preview from './assets/preview.png';

export const fallenTimberSource = parallaxSource({
  key: 'FallenTimber',
  title: 'Fallen Timber',
  theme: 'Woodland',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'distant-pines', url: distantPines, travel: 0.009, anchorY: 0.5 },
    { name: 'pine-grove', url: pineGrove, travel: 0.016, anchorY: 0.5 },
    { name: 'middle-pines', url: middlePines, travel: 0.023 },
    { name: 'fallen-log', url: fallenLog, travel: 0.031 },
    { name: 'near-pines', url: nearPines, travel: 0.042, anchorY: 0 },
    { name: 'forest-floor', url: forestFloor, travel: 0.05 },
  ],
});
