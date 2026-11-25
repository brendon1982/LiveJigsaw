import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import moonAndRuins from './assets/moon-and-ruins.png';
import distantCrags from './assets/distant-crags.png';
import dust from './assets/dust.png';
import nearCrags from './assets/near-crags.png';
import ground from './assets/ground.png';
import preview from './assets/preview.png';

export const verdigrisFrontierSource = parallaxSource({
  key: 'VerdigrisFrontier',
  title: 'Verdigris Frontier',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'moon-and-ruins', url: moonAndRuins, travel: 0.002, seededX: { origin: 0.5, range: [0.33, 0.67] } },
    { name: 'distant-crags', url: distantCrags, travel: 0.017 },
    { name: 'dust', url: dust, travel: 0.028 },
    { name: 'near-crags', url: nearCrags, travel: 0.039 },
    { name: 'ground', url: ground, travel: 0.05 },
  ],
});
