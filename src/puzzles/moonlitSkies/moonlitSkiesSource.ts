import { parallaxSource } from '../parallax/parallaxSource';
import sky from './assets/1.png';
import haze from './assets/2.png';
import stars from './assets/3.png';
import moon from './assets/4.png';
import distantClouds from './assets/5.png';
import lowClouds from './assets/6.png';
import nearClouds from './assets/7.png';
import preview from './assets/preview.png';

export const moonlitSkiesSource = parallaxSource({
  key: 'MoonlitSkies',
  title: 'Moonlit Skies',
  preview,
  layers: [
    { name: 'sky', url: sky, travel: 0, anchorY: 0.5 },
    { name: 'haze', url: haze, travel: 0, anchorY: 0.5 },
    { name: 'stars', url: stars, travel: 0, anchorY: 0, seededX: { origin: 0.5, range: [0.37, 0.63] } },
    { name: 'moon', url: moon, travel: 0.002, anchorY: 0.5, seededX: { origin: 0.596, range: [0, 1] } },
    { name: 'distant-clouds', url: distantClouds, travel: 0.013, anchorY: 0.5 },
    { name: 'low-clouds', url: lowClouds, travel: 0.027 },
    { name: 'near-clouds', url: nearClouds, travel: 0.05, anchorY: 0 },
  ],
});
