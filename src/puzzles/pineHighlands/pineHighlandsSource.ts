import { parallaxSource } from '../parallax/parallaxSource';
import distantClouds from './assets/clouds-bg.png';
import nearClouds from './assets/clouds-fg.png';
import fog from './assets/fog.png';
import woodedHills from './assets/forest-and-mountains.png';
import nearForest from './assets/forest-fg.png';
import ground from './assets/ground.png';
import mountain from './assets/mountain.png';
import preview from './assets/preview.png';
import sky from './assets/sky.png';
import tree from './assets/tree.png';

export const pineHighlandsSource = parallaxSource({
  key: 'PineHighlands',
  title: 'Pine Highlands',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0 },
    { name: 'distant-clouds', url: distantClouds, travel: 0.005, anchorY: 0 },
    { name: 'mountain', url: mountain, travel: 0.012 },
    { name: 'wooded-hills', url: woodedHills, travel: 0.022 },
    { name: 'near-clouds', url: nearClouds, travel: 0.009, anchorY: 0 },
    { name: 'fog', url: fog, travel: 0.016 },
    { name: 'near-forest', url: nearForest, travel: 0.031 },
    { name: 'ground', url: ground, travel: 0.04 },
    { name: 'tree', url: tree, travel: 0.05, foregroundOriginX: 0.701 },
  ],
});
