import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import distantBranches from './assets/distant-branches.png';
import twistedWoods from './assets/twisted-woods.png';
import hangingBranches from './assets/hanging-branches.png';
import hauntedTree from './assets/haunted-tree.png';
import ground from './assets/ground.png';
import preview from './assets/preview.png';

export const thornwoodHollowSource = parallaxSource({
  key: 'ThornwoodHollow',
  title: 'Thornwood Hollow',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'distant-branches', url: distantBranches, travel: 0.006 },
    { name: 'twisted-woods', url: twistedWoods, travel: 0.017 },
    { name: 'hanging-branches', url: hangingBranches, travel: 0.028 },
    { name: 'haunted-tree', url: hauntedTree, travel: 0.039, seededX: { origin: 0.29, range: [0.27, 0.62] } },
    { name: 'ground', url: ground, travel: 0.05 },
  ],
});
