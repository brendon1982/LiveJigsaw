import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/1.png';
import distantHaze from './assets/2.png';
import distantClouds from './assets/3.png';
import roseClouds from './assets/4.png';
import highClouds from './assets/5.png';
import sunlitClouds from './assets/6.png';
import nearClouds from './assets/7.png';
import preview from './assets/preview.png';

export const afterglowSource = parallaxSource({
  key: 'Afterglow',
  title: 'Afterglow',
  theme: 'Sky',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'distant-haze', url: distantHaze, travel: 0.004, anchorY: 0.5 },
    { name: 'distant-clouds', url: distantClouds, travel: 0.008, anchorY: 0.5 },
    { name: 'rose-clouds', url: roseClouds, travel: 0.016, anchorY: 0.5 },
    { name: 'high-clouds', url: highClouds, travel: 0.02, anchorY: 0 },
    { name: 'sunlit-clouds', url: sunlitClouds, travel: 0.03, anchorY: 0.5 },
    { name: 'near-clouds', url: nearClouds, travel: 0.045, anchorY: 0.5 },
  ],
});
