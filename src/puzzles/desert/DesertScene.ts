import Phaser from 'phaser';
import type { Size } from '../../domain/geometry';

const artworkSize = { width: 512, height: 288 };
const cycleDuration = 44_000;
const orbitRadius = 196;

export class DesertScene extends Phaser.Scene {
  static readonly key = 'Desert';
  private animate!: (delta: number) => void;

  constructor() {
    super(DesertScene.key);
  }

  create(viewport: Size) {
    this.animate = drawDesert(this, viewport).animate;
  }

  update(_time: number, delta: number) {
    this.animate(delta);
  }
}

export function drawDesert(scene: Phaser.Scene, viewport: Size) {
  const { width, height } = artworkSize;
  const nightSky = scene.add.graphics();
  nightSky.fillStyle(0x2b3a57).fillRect(0, 0, width, height);
  nightSky.fillStyle(0x3c4b66).fillEllipse(310, 206, 700, 148);
  const sunset = scene.add.rectangle(0, 0, width, height, 0xc68383).setOrigin(0);
  const daySky = scene.add.graphics();
  daySky.fillStyle(0xc9d8cc).fillRect(0, 0, width, height);
  daySky.fillStyle(0xe3c6a4).fillEllipse(288, 197, 820, 152);

  const sun = scene.add.graphics({ x: -orbitRadius });
  sun.fillStyle(0xf8daa0, 0.26).fillCircle(0, 0, 31);
  sun.fillStyle(0xffedbb).fillCircle(0, 0, 24);
  const moon = scene.add.graphics({ x: orbitRadius });
  moon.fillStyle(0xe5e2d5).fillCircle(0, 0, 17);
  moon.fillStyle(0xbbc4c7).fillCircle(-6, 5, 4).fillCircle(6, -6, 5).fillCircle(3, 6, 2);

  const stars = scene.add.graphics();
  stars.fillStyle(0xf5e5c5);
  for (const [x, y, radius] of [
    [-199, -146, 1.5], [-179, -110, 2], [-153, -192, 1], [-127, -164, 2], [-91, -125, 1],
    [-64, -177, 1.5], [-30, -143, 2], [5, -112, 1], [35, -161, 1.5], [78, -185, 2],
    [100, -119, 1], [133, -143, 2], [158, -194, 1], [176, -103, 1.5], [206, -166, 2],
  ]) {
    stars.fillCircle(x, y, radius);
  }
  // Offset the star field so it sits upright when the moon is overhead.
  stars.rotation = Math.PI / 2;
  // The dunes hide the lower half of the path as the sky turns from left to right.
  const orbit = scene.add.container(width / 2, 221, [stars, sun, moon]);

  const dunes = scene.add.graphics();
  dunes.fillStyle(0xbb876e).fillRect(0, 202, width, 86);
  dunes.fillStyle(0xb47f67).fillTriangle(243, 213, 366, 171, 448, 213);
  dunes.fillStyle(0xad765f).fillTriangle(320, 201, 366, 171, 383, 201);
  dunes.fillStyle(0xd9ae7e).fillEllipse(73, 224, 402, 91).fillEllipse(424, 245, 357, 75);
  dunes.fillStyle(0xc99468).fillEllipse(232, 281, 538, 98);
  dunes.fillStyle(0xe3bb84).fillEllipse(419, 302, 377, 94);
  dunes.fillStyle(0x9b765f).fillEllipse(109, 262, 20, 7).fillEllipse(122, 267, 9, 4)
    .fillEllipse(398, 253, 14, 5);
  dunes.lineStyle(5, 0x536f5b).lineBetween(432, 244, 428, 213)
    .lineBetween(430, 233, 419, 229).lineBetween(419, 229, 418, 222)
    .lineBetween(429, 226, 438, 222).lineBetween(438, 222, 439, 215);
  const nightShade = scene.add.rectangle(0, 0, width, height, 0x23304e).setOrigin(0);

  const artwork = scene.add.container(0, 0, [nightSky, sunset, daySky, orbit, dunes, nightShade])
    .setScale(viewport.width / width, viewport.height / height);
  let phase = Math.PI / 3;
  const lightSky = () => {
    const sunHeight = Math.sin(phase);
    const daylight = Phaser.Math.Clamp((sunHeight + 0.08) * 2.4, 0, 1);
    orbit.rotation = phase;
    daySky.setAlpha(daylight);
    sunset.setAlpha(Math.max(0, 0.65 - Math.abs(sunHeight)));
    stars.setAlpha(1 - daylight);
    nightShade.setAlpha((1 - daylight) * 0.32);
  };
  lightSky();

  return {
    objects: [artwork],
    animate(delta: number) {
      phase = (phase + delta / cycleDuration * Math.PI * 2) % (Math.PI * 2);
      lightSky();
    },
  };
}
