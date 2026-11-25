import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import nightClouds from './assets/night-clouds.png';
import crescentMoon from './assets/crescent-moon.png';
import barrenTrees from './assets/barren-trees.png';
import ironFence from './assets/iron-fence.png';
import lamplights from './assets/lamplights.png';
import crypt from './assets/crypt.png';
import foregroundGraves from './assets/foreground-graves.png';
import ground from './assets/ground.png';
import preview from './assets/preview.png';

export const crescentCryptSource = parallaxSource({
  key: 'CrescentCrypt',
  title: 'Crescent Crypt',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'night-clouds', url: nightClouds, travel: 0.006, anchorY: 0.5 },
    { name: 'crescent-moon', url: crescentMoon, travel: 0.002, anchorY: 0.5, seededX: { origin: 0.36, range: [0.14, 0.86] } },
    { name: 'barren-trees', url: barrenTrees, travel: 0.019 },
    { name: 'iron-fence', url: ironFence, travel: 0.025 },
    { name: 'lamplights', url: lamplights, travel: 0.031 },
    { name: 'crypt', url: crypt, travel: 0.037, seededX: { origin: 0.78, range: [0.55, 0.85] } },
    { name: 'foreground-graves', url: foregroundGraves, travel: 0.044 },
    { name: 'ground', url: ground, travel: 0.05 },
  ],
});
