import Phaser from 'phaser';
import type { PuzzleSource, PuzzleSourceSceneData } from '../PuzzleSource';
import artworkUrl from './cherry-blossoms-on-branch.png';

const artworkKey = 'cherry-blossoms-on-branch';
const artworkSize = { width: 1200, height: 1897 };

class CherryBlossomsScene extends Phaser.Scene {
  static readonly key = 'CherryBlossoms';

  constructor() {
    super(CherryBlossomsScene.key);
  }

  preload() {
    if (!this.textures.exists(artworkKey)) this.load.image(artworkKey, artworkUrl);
  }

  create({ width, height }: PuzzleSourceSceneData) {
    const scale = Math.min(width / artworkSize.width, height / artworkSize.height, 1);
    this.add.image(0, 0, artworkKey).setOrigin(0).setScale(scale);
  }
}

export const cherryBlossomsSource: PuzzleSource = {
  title: 'Cherry Blossoms',
  tags: { theme: 'Woodland', type: 'Flat Illustration' },
  motion: 'Static',
  attribution: {
    name: 'Umme Hani Ali',
    url: 'https://unsplash.com/illustrations/pink-cherry-blossoms-on-branch--a5OyxkF24g',
  },
  maxViewport: artworkSize,
  scene: CherryBlossomsScene,
  previewImage: { key: artworkKey, url: artworkUrl },
  drawPreview(scene, { width, height }) {
    const scale = Math.max(width / artworkSize.width, height / artworkSize.height);
    const left = (width - artworkSize.width * scale) / 2;
    const top = (height - artworkSize.height * scale) / 2;
    return [scene.add.image(left, top, artworkKey).setOrigin(0).setScale(scale)];
  },
};