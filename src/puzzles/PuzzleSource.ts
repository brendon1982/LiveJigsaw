import type Phaser from 'phaser';
import type { Size } from '../domain/geometry';
import type { PuzzleTags } from './PuzzleTags';

export type PuzzleMotion = 'Static' | 'Animated';

export const puzzleAnimationSpeeds = ['Slow', 'Normal', 'Fast'] as const;
export type PuzzleAnimationSpeed = typeof puzzleAnimationSpeeds[number];
export const puzzleAnimationRates: Readonly<Record<PuzzleAnimationSpeed, number>> = {
  Slow: 0.5, Normal: 1, Fast: 2,
};

/** Settings passed to the source scene at the start of a puzzle. */
export type PuzzleSourceSceneData = Size & Readonly<{ seed: number; animationSpeed: PuzzleAnimationSpeed }>;

export type PuzzleAttribution = Readonly<{
  name?: string;
  description?: string;
  url?: string;
}>;

/**
 * Artwork for the puzzle. The host starts the scene with PuzzleSourceSceneData
 * and captures the scene's display list. Each scene sets its own animation
 * pacing for Slow, Normal, and Fast. Draw from (0, 0)
 * and let the host manage input, visibility, and the capture camera.
 * maxViewport caps the logical viewport offered for new puzzles.
 * drawPreview creates objects from (0, 0). The picker snapshots them within
 * the requested viewport and destroys them after drawing.
 * If drawPreview needs an image, previewImage tells the picker what to load on demand.
 */
export type PuzzleSource = Readonly<{
  title: string;
  tags: PuzzleTags;
  motion: PuzzleMotion;
  attribution?: PuzzleAttribution;
  maxViewport: Size;
  scene: {
    readonly key: string;
    new(): Phaser.Scene & { create(data: PuzzleSourceSceneData): void };
  };
  previewImage?: Readonly<{ key: string; url: string }>;
  drawPreview(scene: Phaser.Scene, viewport: Size): Phaser.GameObjects.GameObject[];
}>;
