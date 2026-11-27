import { puzzleCredits } from '../creditsCatalog';
import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/1.png';
import highHaze from './assets/2.png';
import distantClouds from './assets/3.png';
import farCloudbank from './assets/4.png';
import middleCloudbank from './assets/5.png';
import lowCloudbank from './assets/6.png';
import preview from './assets/preview.png';

export const seaOfCloudsSource = parallaxSource({
  key: 'SeaOfClouds',
  title: 'Sea of Clouds',
  theme: 'Sky',
  attribution: puzzleCredits.craftpix,
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'high-haze', url: highHaze, travel: 0.004, anchorY: 0 },
    { name: 'distant-clouds', url: distantClouds, travel: 0.009 },
    { name: 'far-cloudbank', url: farCloudbank, travel: 0.015, anchorY: 0.5 },
    { name: 'middle-cloudbank', url: middleCloudbank, travel: 0.024, anchorY: 0.5 },
    { name: 'low-cloudbank', url: lowCloudbank, travel: 0.05 },
  ],
});
