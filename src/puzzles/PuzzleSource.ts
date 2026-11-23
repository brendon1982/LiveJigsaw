import type Phaser from 'phaser';
import type { Size } from '../domain/geometry';

/** Logical viewport and unsigned 32-bit seed for the selected puzzle. */
export type PuzzleSourceSceneData = Size & Readonly<{ seed: number }>;

/**
 * Artwork for the puzzle. The host starts the scene with the viewport and seed
 * as its scene data and captures the scene's display list. Draw from (0, 0)
 * and let the host manage input, visibility, and the capture camera.
 * maxViewport caps both the logical artwork size and the capture resolution.
 * drawPreview creates objects from (0, 0). The picker snapshots them within
 * the requested viewport and destroys them after drawing.
 */
export type PuzzleSource = Readonly<{
  title: string;
  maxViewport: Size;
  scene: {
    readonly key: string;
    new(): Phaser.Scene & { create(data: PuzzleSourceSceneData): void };
  };
  drawPreview(scene: Phaser.Scene, viewport: Size): Phaser.GameObjects.GameObject[];
}>;
