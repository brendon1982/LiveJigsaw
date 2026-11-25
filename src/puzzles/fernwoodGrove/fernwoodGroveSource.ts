import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/7.png';
import distantTrunks from './assets/6.png';
import distantGrove from './assets/5.png';
import rootedTrunks from './assets/4.png';
import lightShafts from './assets/3.png';
import nearTrunks from './assets/2.png';
import undergrowth from './assets/1.png';
import preview from './assets/preview.png';

export const fernwoodGroveSource = parallaxSource({
  key: 'FernwoodGrove',
  title: 'Fernwood Grove',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'distant-trunks', url: distantTrunks, travel: 0.009, anchorY: 0.5 },
    { name: 'distant-grove', url: distantGrove, travel: 0.016, anchorY: 0.5 },
    { name: 'rooted-trunks', url: rootedTrunks, travel: 0.025, anchorY: 0.5 },
    { name: 'light-shafts', url: lightShafts, travel: 0.02, anchorY: 0.5 },
    { name: 'near-trunks', url: nearTrunks, travel: 0.04 },
    { name: 'undergrowth', url: undergrowth, travel: 0.05 },
  ],
});
