import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const paintedGeometrySource = staticImageSource({
  sceneKey: 'PaintedGeometry',
  title: 'Painted Geometry',
  tags: { theme: 'Abstract', type: 'Flat Illustration' },
  attribution: {
    name: 'Martin Sanchez',
    sourceUrl: 'https://unsplash.com/illustrations/abstract-art-piece-featuring-multiple-geometric-shapes-7ZysQurP1Dg',
    artistUrl: 'https://unsplash.com/@zekedrone/illustrations',
  },
  artworkKey: 'painted-geometry',
  artworkUrl,
  artworkSize: { width: 2000, height: 1486 },
  previewUrl,
  backgroundColor: 0xffffff,
});