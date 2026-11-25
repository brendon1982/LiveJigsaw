import Phaser from 'phaser';
import type { Size } from '../../domain/geometry';
import { puzzleAnimationRates, type PuzzleSourceSceneData } from '../PuzzleSource';


const artworkSize = { width: 512, height: 288 };

export class LighthouseScene extends Phaser.Scene {
  static readonly key = 'Lighthouse';
  private animate!: (delta: number) => void;

  constructor() {
    super(LighthouseScene.key);
  }

  create({ animationSpeed, ...viewport }: PuzzleSourceSceneData) {
    const { objects, animate } = drawLighthouse(this, artworkSize);
    this.add.container(0, 0, objects).setScale(viewport.width / artworkSize.width, viewport.height / artworkSize.height);
    this.animate = (delta) => animate(delta * puzzleAnimationRates[animationSpeed]);
  }

  update(_time: number, delta: number) {
    this.animate(delta);
  }
}

export function drawLighthouse(scene: Phaser.Scene, { width, height }: Size) {
  const coast = scene.add.graphics();
  const fillPolygon = (color: number, coordinates: [number, number][]) => {
    coast.fillStyle(color).fillPoints(coordinates.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  };
  coast.fillStyle(0x26364d).fillRect(0, 0, width, height);
  coast.fillStyle(0xd0d9e6).fillCircle(95, 62, 29);
  coast.fillStyle(0x2e4964).fillTriangle(0, 160, 132, 119, 259, 160);
  coast.fillStyle(0x395a73).fillRect(0, 160, width, height - 160);
  fillPolygon(0x294553, [[205, 288], [272, 231], [337, 215], [403, 204], [512, 225], [512, 288]]);
  fillPolygon(0x54777b, [[249, 257], [272, 231], [337, 215], [403, 204], [512, 225], [512, 244]]);
  fillPolygon(0xf3e2bf, [[328, 224], [340, 111], [368, 111], [382, 224]]);
  fillPolygon(0xa65b51, [[335, 159], [373, 159], [377, 187], [332, 187]]);
  coast.fillStyle(0x152835).fillRect(349, 203, 12, 21);

  const waves = scene.add.graphics();
  waves.lineStyle(2, 0x83a7b1, 0.7);
  for (const [x, y, width] of [[28, 179, 29], [143, 199, 42], [70, 228, 57], [190, 253, 26], [29, 264, 35], [227, 178, 34], [432, 188, 45]]) {
    waves.lineBetween(x, y, x + width, y);
  }

  const beam = scene.add.graphics({ x: 354, y: 101 });
  beam.fillStyle(0xfbd884, 0.24).fillTriangle(0, 0, -280, -45, -280, 26);

  const lantern = scene.add.graphics();
  lantern.fillStyle(0xf7d68f).fillRect(341, 91, 26, 22);
  lantern.fillStyle(0x152835).fillTriangle(330, 91, 354, 73, 379, 91);
  lantern.fillStyle(0x152835).fillRect(334, 113, 40, 5);

  let elapsed = 0;
  return {
    objects: [coast, waves, beam, lantern],
    animate(delta: number) {
      elapsed += delta;
      beam.rotation = Math.sin(elapsed / 2400) * 0.13;
      waves.x = Math.sin(elapsed / 900) * 7;
    },
  };
}
