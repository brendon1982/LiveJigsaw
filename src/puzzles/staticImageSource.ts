import Phaser from 'phaser';
import type { PuzzleSource, PuzzleSourceSceneData } from './PuzzleSource';
import { imagePreview } from './imagePreview';

type StaticImageOptions = Pick<PuzzleSource, 'title' | 'tags' | 'attribution'> & {
  sceneKey: string;
  artworkKey: string;
  artworkUrl: string;
  artworkSize: PuzzleSource['maxViewport'];
  previewUrl: string;
};

export function staticImageSource({
  sceneKey, artworkKey, artworkUrl, artworkSize, previewUrl, ...metadata
}: StaticImageOptions): PuzzleSource {
  class StaticImageScene extends Phaser.Scene {
    static readonly key = sceneKey;

    constructor() {
      super(sceneKey);
    }

    preload() {
      if (!this.textures.exists(artworkKey)) this.load.image(artworkKey, artworkUrl);
    }

    create({ width, height }: PuzzleSourceSceneData) {
      const scale = Math.min(width / artworkSize.width, height / artworkSize.height, 1);
      this.add.image(0, 0, artworkKey).setOrigin(0).setScale(scale);
    }
  }

  return {
    ...metadata,
    motion: 'Static',
    maxViewport: artworkSize,
    scene: StaticImageScene,
    ...imagePreview(`${artworkKey}-preview`, previewUrl),
  };
}