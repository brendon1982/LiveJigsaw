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
  seededX?: Readonly<{
    /** Horizontal anchor in the source image, as a fraction of its width. */
    origin: number;
    /** Range for the anchor in the viewport. By default it may start slightly outside either edge. */
    range?: readonly [min: number, max: number];
  }>;
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
const defaultPlacementRange = [-0.06, 1.06] as const;

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
      // Assign positions front to back so new background placements preserve the foreground's seed.
      const restXFractions = [...layers].reverse().map(({ seededX }) => {
        if (!seededX) return 0.5;
        const [min, max] = seededX.range ?? defaultPlacementRange;
        return Phaser.Math.Linear(min, max, random());
      }).reverse();
      const movingLayers = layers.map(({ name, travel, anchorY = 1, seededX }, index) => {
        const restX = width * restXFractions[index];
        const image = this.add.image(restX, height * anchorY, textureKey(name))
          .setOrigin(seededX?.origin ?? 0.5, anchorY)
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
