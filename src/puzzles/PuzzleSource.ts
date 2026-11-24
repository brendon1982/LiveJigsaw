import type Phaser from 'phaser';
import type { Size } from '../domain/geometry';

export const puzzleAnimationSpeeds = ['Slow', 'Normal', 'Fast'] as const;
export type PuzzleAnimationSpeed = typeof puzzleAnimationSpeeds[number];

/** Settings passed to the source scene at the start of a puzzle. */
export type PuzzleSourceSceneData = Size & Readonly<{ seed: number; animationSpeed: PuzzleAnimationSpeed }>;

/**
 * Artwork for the puzzle. The host starts the scene with PuzzleSourceSceneData
 * and captures the scene's display list. Each scene sets its own animation
 * pacing for Slow, Normal, and Fast. Draw from (0, 0)
 * and let the host manage input, visibility, and the capture camera.
 * maxViewport caps both the logical artwork size and the capture resolution.
 * drawPreview creates objects from (0, 0). The picker snapshots them within
 * the requested viewport and destroys them after drawing.
 * preloadPreview queues any assets needed by the picker.
 */
export type PuzzleSource = Readonly<{
  title: string;
  maxViewport: Size;
  scene: {
    readonly key: string;
    new(): Phaser.Scene & { create(data: PuzzleSourceSceneData): void };
  };
  preloadPreview?(scene: Phaser.Scene): void;
  drawPreview(scene: Phaser.Scene, viewport: Size): Phaser.GameObjects.GameObject[];
}>;
