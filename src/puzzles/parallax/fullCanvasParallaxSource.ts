import { parallaxSource } from './parallaxSource';

type FullCanvasArtwork = Omit<Parameters<typeof parallaxSource>[0], 'layers'> & {
  layerUrls: Record<string, string>;
};

const foregroundTravel = 0.05;

export function fullCanvasParallaxSource({ layerUrls, ...artwork }: FullCanvasArtwork) {
  // Numbered filenames order the full-canvas layers from background to foreground.
  const paths = Object.keys(layerUrls).sort();
  const foregroundDepth = Math.max(1, paths.length - 1);
  const layers = paths.map((path, depth) => ({
    name: path.slice('./assets/'.length, -'.png'.length),
    url: layerUrls[path],
    travel: foregroundTravel * depth / foregroundDepth,
    anchorY: 0.5,
  }));
  return parallaxSource({ ...artwork, layers });
}