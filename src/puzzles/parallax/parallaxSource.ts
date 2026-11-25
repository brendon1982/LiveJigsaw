import Phaser from 'phaser';
import { seededRandom } from '../../domain/seededRandom';
import { imagePreview } from '../imagePreview';
import { puzzleAnimationRates, type PuzzleSource, type PuzzleSourceSceneData } from '../PuzzleSource';

type ParallaxLayer = Readonly<{
  name: string;
  url: string;
  /** Maximum horizontal displacement as a fraction of the viewport width. */
  travel: number;
  /** Vertical point to keep in frame when enlarging the artwork. Defaults to the bottom. */
  anchorY?: number;
  /** Horizontal ground contact in the source image. Supplying it enables seeded foreground placement. */
  foregroundOriginX?: number;
}>;

type ParallaxArtwork = Readonly<{
  key: string;
  title: string;
  preview: string;
  /** The compositing order, from back to front. */
  layers: readonly ParallaxLayer[];
}>;

const cycleDuration = 14_000;
const firstEdge = Math.PI / 2;
const oppositeEdge = 3 * Math.PI / 2;
const minPause = 600;
const maxPause = 1_800;
const foregroundOverhang = 0.06;

export function parallaxSource({ key, title, preview, layers }: ParallaxArtwork): PuzzleSource {
  const textureKey = (name: string) => `parallax-${key}-${name}`;
  // Reserve the maximum layer travel on both sides, plus a margin for filtering.
  const overscan = 1 + 2 * Math.max(...layers.map(({ travel }) => travel)) + 0.02;

  class ParallaxScene extends Phaser.Scene {
    static readonly key = key;

    constructor() {
      super(key);
    }

    preload() {
      for (const { name, url } of layers) {
        const texture = textureKey(name);
        if (!this.textures.exists(texture)) this.load.image(texture, url);
      }
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        for (const { name } of layers) {
          const texture = textureKey(name);
          if (this.textures.exists(texture)) this.textures.remove(texture);
        }
      });
    }

    create({ width, height, seed, animationSpeed }: PuzzleSourceSceneData) {
      const random = seededRandom(seed);
      const movingLayers = layers.map(({ name, travel, anchorY = 1, foregroundOriginX }) => {
        const position = foregroundOriginX === undefined
          ? 0.5
          : Phaser.Math.Linear(-foregroundOverhang, 1 + foregroundOverhang, random());
        const restX = width * position;
        const image = this.add.image(restX, height * anchorY, textureKey(name))
          .setOrigin(foregroundOriginX ?? 0.5, anchorY)
          .setDisplaySize(width * overscan, height * overscan);
        return { image, restX, travel: width * travel };
      });

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
            for (const { image, restX, travel } of movingLayers) {
              image.x = restX - pan * travel;
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

  return {
    title,
    maxViewport: { width: 1920, height: 1080 },
    scene: ParallaxScene,
    ...imagePreview(textureKey('preview'), preview),
  };
}
