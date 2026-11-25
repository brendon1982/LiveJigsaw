import Phaser from 'phaser';
import type { Size } from '../../domain/geometry';
import { puzzleAnimationRates, type PuzzleSourceSceneData } from '../PuzzleSource';

const artworkSize = { width: 512, height: 288 };

export class MountainsScene extends Phaser.Scene {
  static readonly key = 'Mountains';
  private animate!: (delta: number) => void;

  constructor() {
    super(MountainsScene.key);
  }

  create({ animationSpeed, ...viewport }: PuzzleSourceSceneData) {
    const { animate } = drawMountains(this, viewport);
    this.animate = (delta) => animate(delta * puzzleAnimationRates[animationSpeed]);
  }

  update(_time: number, delta: number) {
    this.animate(delta);
  }
}

export function drawMountains(scene: Phaser.Scene, viewport: Size) {
  const { width, height } = artworkSize;
  const sky = scene.add.graphics();
  sky.fillStyle(0xaecdd7).fillRect(0, 0, width, height);
  sky.fillStyle(0xf8e5b4).fillCircle(401, 64, 25);

  const clouds = [
    { x: 68, y: 52, scale: 1, speed: 8 },
    { x: 238, y: 37, scale: 0.62, speed: 5 },
    { x: 335, y: 96, scale: 0.8, speed: 6 },
    { x: 456, y: 48, scale: 0.72, speed: 5 },
  ].map(({ x, y, scale, speed }) => {
    const cloud = scene.add.graphics({ x, y }).setScale(scale);
    cloud.fillStyle(0xf1ede0, 0.83).fillEllipse(0, 3, 99, 16)
      .fillEllipse(-13, -3, 42, 23).fillEllipse(15, -3, 34, 19);
    return { cloud, start: x, speed };
  });

  const valley = drawValley(scene, width);

  const artwork = scene.add.container(0, 0, [sky, ...clouds.map(({ cloud }) => cloud), valley])
    .setScale(viewport.width / width, viewport.height / height);
  let elapsed = 0;
  const cloudMargin = 56;
  return {
    objects: [artwork],
    animate(delta: number) {
      elapsed += delta / 1000;
      for (const { cloud, start, speed } of clouds) {
        cloud.x = (start + elapsed * speed + cloudMargin) % (width + 2 * cloudMargin) - cloudMargin;
      }
    },
  };
}

function drawValley(scene: Phaser.Scene, width: number) {
  const valley = scene.add.graphics();
  valley.fillStyle(0x809caa).fillTriangle(-75, 208, 81, 99, 222, 208)
    .fillTriangle(252, 208, 427, 99, 556, 208);
  valley.fillStyle(0x647f92).fillTriangle(31, 218, 194, 66, 324, 218);
  valley.fillStyle(0x7793a1).fillTriangle(194, 66, 324, 218, 220, 218);
  valley.fillStyle(0xe5e8df).fillTriangle(147, 110, 194, 66, 233, 112)
    .fillTriangle(147, 110, 175, 101, 166, 123).fillTriangle(193, 102, 233, 112, 209, 119);
  valley.fillStyle(0x526e82).fillTriangle(181, 218, 333, 104, 474, 218);
  valley.fillStyle(0xd6e0dc).fillTriangle(283, 142, 333, 104, 372, 136)
    .fillTriangle(304, 130, 345, 133, 326, 145);
  valley.fillStyle(0x68877e).fillRect(0, 203, width, 85).fillEllipse(62, 203, 235, 46);
  valley.fillStyle(0x87aab0).fillEllipse(291, 253, 390, 66);
  valley.fillStyle(0x577568).fillEllipse(21, 275, 264, 104).fillEllipse(458, 297, 313, 84);
  valley.lineStyle(2, 0xb4ced0, 0.75);
  for (const [x, y, length] of [[181, 241, 50], [342, 245, 49], [250, 260, 72], [135, 272, 34]]) {
    valley.lineBetween(x, y, x + length, y);
  }
  return valley;
}
