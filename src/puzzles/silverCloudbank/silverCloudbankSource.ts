import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/1.png';
import highClouds from './assets/2.png';
import distantClouds from './assets/3.png';
import toweringClouds from './assets/4.png';
import nearClouds from './assets/5.png';
import preview from './assets/preview.png';

export const silverCloudbankSource = parallaxSource({
  key: 'SilverCloudbank',
  title: 'Silver Cloudbank',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'high-clouds', url: highClouds, travel: 0.006, anchorY: 0 },
    { name: 'distant-clouds', url: distantClouds, travel: 0.012, anchorY: 0.5 },
    { name: 'towering-clouds', url: toweringClouds, travel: 0.026, anchorY: 0.5 },
    { name: 'near-clouds', url: nearClouds, travel: 0.05 },
  ],
});
