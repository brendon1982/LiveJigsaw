import Phaser from 'phaser';
import type { Size } from '../../domain/geometry';
import type { PuzzleAnimationSpeed, PuzzleSourceSceneData } from '../PuzzleSource';

const animationRate: Record<PuzzleAnimationSpeed, number> = { Slow: 0.5, Normal: 1, Fast: 2 };

const artworkSize = { width: 512, height: 288 };

export class ForestScene extends Phaser.Scene {
  static readonly key = 'Forest';
  private animate!: (delta: number) => void;

  constructor() {
    super(ForestScene.key);
  }

  create({ animationSpeed, ...viewport }: PuzzleSourceSceneData) {
    const { animate } = drawForest(this, viewport);
    this.animate = (delta) => animate(delta * animationRate[animationSpeed]);
  }

  update(_time: number, delta: number) {
    this.animate(delta);
  }
}

export function drawForest(scene: Phaser.Scene, viewport: Size) {
  const { width, height } = artworkSize;
  const clearing = scene.add.graphics();
  clearing.fillStyle(0xc5d9bd).fillRect(0, 0, width, height);
  clearing.fillStyle(0xebdfae).fillCircle(307, 65, 33);
  clearing.fillStyle(0x96ad90).fillEllipse(128, 201, 392, 113).fillEllipse(441, 185, 366, 95);
  clearing.fillStyle(0x7e9b80);
  for (const [x, base, size] of [[12, 207, 83], [60, 186, 106], [145, 194, 79], [200, 199, 103], [340, 200, 92], [402, 196, 120], [491, 201, 104]]) {
    clearing.fillTriangle(x - size / 4, base, x, base - size, x + size / 4, base);
  }
  clearing.fillStyle(0x68896f).fillEllipse(218, 256, 709, 151).fillRect(0, 253, width, 35);
  const path = [[276, 182], [290, 198], [280, 220], [312, 245], [383, 288], [221, 288], [236, 255], [260, 221], [274, 199]];
  clearing.fillStyle(0xacaa83).fillPoints(path.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  clearing.fillStyle(0xbdb48c).fillEllipse(271, 245, 42, 6).fillEllipse(303, 274, 50, 5);

  const trees = [
    { x: 177, y: 204, size: 0.63, shade: 0x678970, leaves: 0x7d9d78, phase: 0.2 },
    { x: 364, y: 214, size: 0.72, shade: 0x5e8068, leaves: 0x789875, phase: 1.4 },
    { x: 104, y: 247, size: 0.91, shade: 0x4c735f, leaves: 0x658c6c, phase: 2.1 },
    { x: 437, y: 253, size: 1, shade: 0x486e5c, leaves: 0x628466, phase: 2.7 },
    { x: 39, y: 275, size: 1.1, shade: 0x436859, leaves: 0x587f65, phase: 3.6 },
    { x: 502, y: 283, size: 1.15, shade: 0x406657, leaves: 0x54785f, phase: 4.3 },
  ].map(({ x, y, size, shade, leaves, phase }) => {
    const tree = scene.add.graphics({ x, y }).setScale(size);
    tree.fillStyle(0x5f594c).fillTriangle(-9, 0, 0, -160, 8, 0);
    tree.lineStyle(5, 0x5f594c).lineBetween(1, -71, 28, -113).lineBetween(-1, -88, -28, -128);
    tree.fillStyle(shade).fillEllipse(-28, -127, 73, 62).fillEllipse(30, -127, 76, 70)
      .fillEllipse(-3, -166, 106, 91);
    tree.fillStyle(leaves).fillEllipse(-22, -172, 60, 55).fillEllipse(15, -183, 60, 48)
      .fillEllipse(36, -143, 56, 46);
    return { tree, phase };
  });

  const undergrowth = scene.add.graphics();
  undergrowth.fillStyle(0x507662).fillEllipse(62, 287, 174, 51).fillEllipse(455, 282, 156, 36);
  undergrowth.fillStyle(0x719571).fillEllipse(62, 274, 41, 13).fillEllipse(447, 271, 36, 10);
  undergrowth.fillStyle(0xd9c783).fillCircle(135, 271, 3).fillCircle(149, 278, 2.5).fillCircle(387, 261, 3);

  const artwork = scene.add.container(0, 0, [clearing, ...trees.map(({ tree }) => tree), undergrowth])
    .setScale(viewport.width / width, viewport.height / height);
  let elapsed = 0;
  return {
    objects: [artwork],
    animate(delta: number) {
      elapsed += delta / 1000;
      for (const { tree, phase } of trees) {
        tree.rotation = Math.sin(elapsed * 0.9 + phase) * 0.025 + Math.sin(elapsed * 1.8 + phase) * 0.008;
      }
    },
  };
}
