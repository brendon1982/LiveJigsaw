import type Phaser from 'phaser';
import { type Artwork, PuzzleSourceScene, sceneHeight, sceneWidth } from './PuzzleSourceScene';

export class WindmillScene extends PuzzleSourceScene {
  static readonly key = 'Windmill';

  constructor() {
    super(WindmillScene.key);
  }

  protected drawArtwork() {
    return drawWindmill(this);
  }
}

export function drawWindmill(scene: Phaser.Scene): Artwork {
  const landscape = scene.add.graphics();
  landscape.fillStyle(0xc0dddb).fillRect(0, 0, sceneWidth, sceneHeight);
  landscape.fillStyle(0xfdf0ba).fillCircle(393, 66, 27);
  landscape.fillStyle(0x91ae87).fillEllipse(115, 223, 360, 115);
  landscape.fillStyle(0x789774).fillEllipse(385, 243, 355, 150);
  landscape.fillStyle(0x587f68).fillRect(0, 235, sceneWidth, 53);
  landscape.fillStyle(0xead7ac).fillRect(226, 151, 60, 91);
  landscape.fillStyle(0xa25b48).fillTriangle(216, 151, 256, 118, 296, 151);
  landscape.fillStyle(0x755344).fillRect(249, 206, 14, 36);

  const sails = scene.add.graphics({ x: 256, y: 151 });
  for (let turn = 0; turn < 4; turn += 1) {
    sails.save();
    sails.rotateCanvas(turn * Math.PI / 2);
    sails.fillStyle(0x755344).fillRect(-2, -63, 4, 64);
    sails.fillStyle(0xfff4d9).fillRect(2, -63, 10, 37);
    sails.restore();
  }
  sails.fillStyle(0x755344).fillCircle(0, 0, 5);

  return { objects: [landscape, sails], animate: (delta) => { sails.rotation += delta * 0.00035; } };
}
