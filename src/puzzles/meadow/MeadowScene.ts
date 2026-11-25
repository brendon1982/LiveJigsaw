import Phaser from 'phaser';
import type { Size } from '../../domain/geometry';
import { puzzleAnimationRates, type PuzzleSourceSceneData } from '../PuzzleSource';


const artworkSize = { width: 512, height: 288 };

export class MeadowScene extends Phaser.Scene {
  static readonly key = 'Meadow';
  private animate!: (delta: number) => void;

  constructor() {
    super(MeadowScene.key);
  }

  create({ animationSpeed, ...viewport }: PuzzleSourceSceneData) {
    const { animate } = drawMeadow(this, viewport);
    this.animate = (delta) => animate(delta * puzzleAnimationRates[animationSpeed]);
  }

  update(_time: number, delta: number) {
    this.animate(delta);
  }
}

export function drawMeadow(scene: Phaser.Scene, viewport: Size) {
  const { width, height } = artworkSize;
  const field = scene.add.graphics();
  field.fillStyle(0xc7ded6).fillRect(0, 0, width, height);
  field.fillStyle(0xf9ebba).fillCircle(123, 70, 31);
  field.fillStyle(0xa3b88c).fillEllipse(412, 193, 370, 127).fillEllipse(111, 196, 358, 114);
  field.fillStyle(0x83a475).fillEllipse(215, 251, 624, 177);
  field.fillStyle(0x72966b).fillRect(0, 242, width, 46).fillEllipse(469, 255, 420, 110);
  field.fillStyle(0x628360).fillEllipse(53, 296, 280, 89);

  const flowers = [
    [46, 253, 22, 0xf6df9e], [69, 270, 13, 0xf2dab8], [115, 255, 14, 0xefc2ab],
    [159, 231, 12, 0xf6df9e], [191, 270, 21, 0xe5b4a7], [242, 247, 15, 0xf2dab8],
    [288, 269, 18, 0xf6df9e], [331, 238, 16, 0xefc2ab], [358, 260, 12, 0xf2dab8],
    [405, 272, 18, 0xf6df9e], [438, 231, 16, 0xefc2ab], [477, 252, 22, 0xf2dab8],
  ];
  for (const [x, y, stem, color] of flowers) {
    field.lineStyle(2, 0x4d7255).lineBetween(x - 2, y, x, y - stem);
    field.fillStyle(0x527b54).fillEllipse(x - 4, y - 6, 7, 3).fillEllipse(x + 2, y - 10, 7, 3);
    field.fillStyle(color).fillCircle(x, y - stem, stem * 0.24);
    field.fillStyle(0xc88e61).fillCircle(x, y - stem, 1.6);
  }

  const butterflies = [
    { x: 101, y: 178, color: 0xd58a72, phase: 0.5 },
    { x: 248, y: 205, color: 0xf0c988, phase: 2.3 },
    { x: 389, y: 155, color: 0xe5a9a9, phase: 3.9 },
    { x: 449, y: 212, color: 0xeedcba, phase: 5.6 },
  ].map(({ x, y, color, phase }) => {
    const wings = scene.add.graphics();
    wings.fillStyle(color).fillEllipse(-5, -2, 10, 9).fillEllipse(5, -2, 10, 9)
      .fillEllipse(-3, 3, 6, 6).fillEllipse(3, 3, 6, 6);
    const body = scene.add.graphics();
    body.lineStyle(1.5, 0x584743).lineBetween(0, -4, 0, 5);
    const butterfly = scene.add.container(x, y, [wings, body]);
    return { butterfly, wings, x, y, phase };
  });

  const artwork = scene.add.container(0, 0, [field, ...butterflies.map(({ butterfly }) => butterfly)])
    .setScale(viewport.width / width, viewport.height / height);
  let elapsed = 0;
  return {
    objects: [artwork],
    animate(delta: number) {
      elapsed += delta / 1000;
      for (const { butterfly, wings, x, y, phase } of butterflies) {
        const flight = elapsed * 0.7 + phase;
        butterfly.setPosition(x + Math.sin(flight) * 34, y + Math.sin(flight * 2) * 11);
        butterfly.rotation = Math.cos(flight) * 0.5;
        wings.scaleX = 0.25 + Math.abs(Math.sin(elapsed * 11 + phase)) * 0.75;
      }
    },
  };
}
