import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/7.png';
import distantOaks from './assets/6.png';
import middleOaks from './assets/5.png';
import gladeGrasses from './assets/5_1.png';
import canopyAndGrass from './assets/4.png';
import nearOaks from './assets/3.png';
import rocksAndMeadow from './assets/1.png';
import preview from './assets/preview.png';

export const amberWoodsSource = parallaxSource({
  key: 'AmberWoods',
  title: 'Amber Woods',
  theme: 'Woodland',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'distant-oaks', url: distantOaks, travel: 0.008, anchorY: 0.5, seededX: { origin: 0.5, range: [0.43, 0.57] } },
    { name: 'middle-oaks', url: middleOaks, travel: 0.016, anchorY: 0.5 },
    { name: 'glade-grasses', url: gladeGrasses, travel: 0.022, anchorY: 0.5 },
    { name: 'canopy-and-grass', url: canopyAndGrass, travel: 0.031, anchorY: 0.5 },
    { name: 'near-oaks', url: nearOaks, travel: 0.04, anchorY: 0.5 },
    { name: 'rocks-and-meadow', url: rocksAndMeadow, travel: 0.05 },
  ],
});
