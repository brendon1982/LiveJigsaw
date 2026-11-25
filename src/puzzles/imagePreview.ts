import type { PuzzleSource } from './PuzzleSource';

export function imagePreview(key: string, url: string): Pick<PuzzleSource, 'previewImage' | 'drawPreview'> {
  return {
    previewImage: { key, url },
    drawPreview(scene, { width, height }) {
      return [scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(width, height)];
    },
  };
}
