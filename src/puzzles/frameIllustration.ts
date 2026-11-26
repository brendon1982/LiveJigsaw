import type Phaser from 'phaser';
import type { Size } from '../domain/geometry';

export function frameIllustration(
  scene: Phaser.Scene,
  viewport: Size,
  artworkSize: Size,
  objects: Phaser.GameObjects.GameObject[],
) {
  const scale = Math.max(viewport.width / artworkSize.width, viewport.height / artworkSize.height);
  const x = (viewport.width - artworkSize.width * scale) / 2;
  const y = (viewport.height - artworkSize.height * scale) / 2;
  return scene.add.container(x, y, objects).setScale(scale);
}