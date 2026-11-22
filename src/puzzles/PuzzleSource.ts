import type Phaser from 'phaser';
import type { Size } from '../domain/geometry';

/**
 * Artwork for the puzzle. The host starts the scene with the logical viewport
 * as its scene data and captures the scene's display list. Draw from (0, 0)
 * and let the host manage input, visibility, and the capture camera.
 * maxViewport caps both the logical artwork size and the capture resolution.
 */
export type PuzzleSource = Readonly<{
  title: string;
  maxViewport: Size;
  scene: {
    readonly key: string;
    new(): Phaser.Scene & { create(viewport: Size): void };
  };
  drawPreview(scene: Phaser.Scene, viewport: Size): Phaser.GameObjects.GameObject[];
}>;
