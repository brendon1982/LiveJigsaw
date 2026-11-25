import type { PuzzleSource } from './PuzzleSource';

export function imagePreview(key: string, url: string): Pick<PuzzleSource, 'preloadPreview' | 'drawPreview'> {
  return {
    preloadPreview(scene) {
      if (!scene.textures.exists(key)) scene.load.image(key, url);
    },
    drawPreview(scene, { width, height }) {
      return [scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(width, height)];
    },
  };
}
