import Phaser from 'phaser';
import type { Size } from '../../domain/geometry';
import { seededRandom } from '../../domain/seededRandom';
import { imagePreview } from '../imagePreview';
import { puzzleAnimationRates, type PuzzleAttribution, type PuzzleSource, type PuzzleSourceSceneData } from '../PuzzleSource';
import type { PuzzleTheme } from '../PuzzleTags';

type ParallaxLayer = Readonly<{
  name: string;
  url: string;
  /** Maximum horizontal displacement as a fraction of the viewport width. */
  travel: number;
  /** Vertical alignment when cropping to the viewport. Defaults to the bottom. */
  anchorY?: number;
  /** Seeded placement for layers with transparent side edges that can drift freely. */
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
  theme: PuzzleTheme;
  attribution?: PuzzleAttribution;
  preview: string;
  artworkSize?: Size;
  /** The compositing order, from back to front. */
  layers: readonly ParallaxLayer[];
}>;

const cycleDuration = 14_000;
const firstEdge = Math.PI / 2;
const oppositeEdge = 3 * Math.PI / 2;
const minPause = 600;
const maxPause = 1_800;
const defaultPlacementRange = [-0.06, 1.06] as const;
const standardArtworkSize = { width: 1920, height: 1080 };

export function parallaxSource({
  key, title, theme, attribution, preview, artworkSize = standardArtworkSize, layers,
}: ParallaxArtwork): PuzzleSource {
  const textureKey = (name: string) => `parallax-${key}-${name}`;

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
          .setOrigin(seededX?.origin ?? 0.5, anchorY);
        return { image, restX, travel: width * travel, driftsFreely: seededX !== undefined };
      });

      // Fit the whole sweep, not just the view at rest, without scaling past native size.
      let requiredScale = Math.max(width / artworkSize.width, height / artworkSize.height);
      for (const { image, travel, driftsFreely } of movingLayers) {
        if (!driftsFreely) requiredScale = Math.max(requiredScale, (width + 2 * travel) / image.width);
      }
      const artworkScale = Math.min(1, requiredScale);
      for (const layer of movingLayers) {
        layer.image.setScale(artworkScale);
        if (!layer.driftsFreely) {
          const cropRoom = Math.max(0, (layer.image.displayWidth - width) / 2);
          layer.travel = Math.min(layer.travel, cropRoom);
        }
      }

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
    tags: { theme, type: 'Parallax' },
    motion: 'Animated',
    attribution,
    maxViewport: artworkSize,
    scene: ParallaxScene,
    ...imagePreview(textureKey('preview'), preview),
  };
}
