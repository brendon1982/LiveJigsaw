import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const colorInMotionSource = staticImageSource({
  sceneKey: 'ColorInMotion',
  title: 'Color in Motion',
  tags: { theme: 'Abstract', type: 'Flat Illustration' },
  attribution: {
    name: 'Bessy Caleze',
    sourceUrl: 'https://unsplash.com/illustrations/a-picture-of-a-colorful-abstract-design-on-a-white-background-XNL2VHsOg_g',
    artistUrl: 'https://unsplash.com/@bessycaleze/illustrations',
  },
  artworkKey: 'color-in-motion',
  artworkUrl,
  artworkSize: { width: 2000, height: 2648 },
  previewUrl,
  backgroundColor: 0xffffff,
});