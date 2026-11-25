import { parallaxSource } from '../parallax/parallaxSource';
import nebula from './assets/nebula.png';
import stars from './assets/stars.png';
import sun from './assets/sun.png';
import distantSatellite from './assets/distant-satellite.png';
import planet from './assets/planet.png';
import nearSatellite from './assets/near-satellite.png';
import preview from './assets/preview.png';

export const eclipseOrbitSource = parallaxSource({
  key: 'EclipseOrbit',
  title: 'Eclipse Orbit',
  preview,
  layers: [
    { name: 'nebula', url: nebula, travel: 0, anchorY: 0.5 },
    { name: 'stars', url: stars, travel: 0.002, anchorY: 0.5, seededX: { origin: 0.5, range: [0.4, 0.6] } },
    { name: 'sun', url: sun, travel: 0.003, anchorY: 0.5, seededX: { origin: 0.849, range: [0.6, 0.9] } },
    { name: 'distant-satellite', url: distantSatellite, travel: 0.028, anchorY: 0.5, seededX: { origin: 0.456, range: [0.12, 0.88] } },
    { name: 'planet', url: planet, travel: 0.039, anchorY: 0.5, seededX: { origin: 0.297, range: [0.21, 0.68] } },
    { name: 'near-satellite', url: nearSatellite, travel: 0.05, anchorY: 0.5, seededX: { origin: 0.153, range: [0.12, 0.88] } },
  ],
});
