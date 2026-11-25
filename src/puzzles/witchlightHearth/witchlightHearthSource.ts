import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/sky.png';
import outdoorWoods from './assets/outdoor-woods.png';
import cabinWall from './assets/cabin-wall.png';
import wallDecor from './assets/wall-decor.png';
import pumpkinDecor from './assets/pumpkin-decor.png';
import fireplace from './assets/fireplace.png';
import floor from './assets/floor.png';
import preview from './assets/preview.png';

export const witchlightHearthSource = parallaxSource({
  key: 'WitchlightHearth',
  title: 'Witchlight Hearth',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'outdoor-woods', url: outdoorWoods, travel: 0.006 },
    { name: 'cabin-wall', url: cabinWall, travel: 0.015 },
    { name: 'wall-decor', url: wallDecor, travel: 0.024 },
    { name: 'pumpkin-decor', url: pumpkinDecor, travel: 0.032 },
    { name: 'fireplace', url: fireplace, travel: 0.041, seededX: { origin: 0.77, range: [0.61, 0.87] } },
    { name: 'floor', url: floor, travel: 0.05 },
  ],
});
