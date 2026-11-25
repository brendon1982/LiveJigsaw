import Phaser from 'phaser';
import { puzzleAnimationRates, type PuzzleSourceSceneData } from '../PuzzleSource';
import cactus from './assets/cactus.png';
import clouds from './assets/clouds.png';
import dust from './assets/dust.png';
import fog from './assets/fog.png';
import ground from './assets/ground.png';
import distantMesas from './assets/mountains-bg.png';
import foothills from './assets/mountains-fg.png';
import sky from './assets/sky.png';

// Back to front in the supplied artwork. Travel is measured as a fraction of the viewport width.
const layers = [
  { name: 'sky', url: sky, travel: 0 },
  { name: 'dust', url: dust, travel: 0.006 },
  { name: 'distant-mesas', url: distantMesas, travel: 0.012 },
  { name: 'foothills', url: foothills, travel: 0.025 },
  { name: 'fog', url: fog, travel: 0.018 },
  { name: 'clouds', url: clouds, travel: 0.008 },
  { name: 'ground', url: ground, travel: 0.036 },
  { name: 'cactus', url: cactus, travel: 0.05 },
] as const;

const cycleDuration = 14_000;
const firstEdge = Math.PI / 2;
const oppositeEdge = 3 * Math.PI / 2;
const minPause = 600;
const maxPause = 1_800;
const overscan = 1.12;

export class CanyonDriftScene extends Phaser.Scene {
  static readonly key = 'CanyonDrift';

  constructor() {
    super(CanyonDriftScene.key);
  }

  preload() {
    for (const { name, url } of layers) {
      const key = `canyon-drift-${name}`;
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
  }

  create({ width, height, animationSpeed }: PuzzleSourceSceneData) {
    const centerX = width / 2;
    // Keep the bottom of the artwork in frame and leave room for horizontal travel on both sides.
    const movingLayers = layers.map(({ name, travel }) => ({
      image: this.add.image(centerX, height, `canyon-drift-${name}`)
        .setOrigin(0.5, 1)
        .setDisplaySize(width * overscan, height * overscan),
      travel: width * travel,
    }));

    const drift = { angle: 0 };
    const rate = puzzleAnimationRates[animationSpeed];
    const panTo = (angle: number, duration: number, pause = 0) => {
      this.tweens.add({
        targets: drift,
        angle,
        duration: duration / rate,
        delay: pause / rate,
        onUpdate: () => {
          const pan = Math.sin(drift.angle);
          for (const { image, travel } of movingLayers) {
            image.x = centerX - pan * travel;
          }
        },
        onComplete: () => {
          const nextEdge = angle === firstEdge ? oppositeEdge : firstEdge;
          const pauseAtEdge = Phaser.Math.Between(minPause, maxPause);
          panTo(nextEdge, cycleDuration / 2, pauseAtEdge);
        },
      });
    };
    panTo(firstEdge, cycleDuration / 4);
  }
}
