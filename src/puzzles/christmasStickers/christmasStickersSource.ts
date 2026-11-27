import { staticImageSource } from '../staticImageSource';
import artworkUrl from './artwork.png';
import previewUrl from './preview.jpg';

export const christmasStickersSource = staticImageSource({
  sceneKey: 'ChristmasStickers',
  title: 'Christmas Stickers',
  tags: { theme: 'Christmas', type: 'Flat Illustration' },
  attribution: {
    name: 'Chris Costa',
    sourceUrl: 'https://unsplash.com/illustrations/christmas-character-stickers-on-colorful-background-PXpSRUk9It4',
    artistUrl: 'https://unsplash.com/@chrisxcosta/illustrations',
  },
  artworkKey: 'christmas-stickers',
  artworkUrl,
  artworkSize: { width: 2499, height: 2000 },
  previewUrl,
});
