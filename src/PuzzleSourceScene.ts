import Phaser from 'phaser';

export const sceneWidth = 512;
export const sceneHeight = 288;

export type Artwork = {
  objects: Phaser.GameObjects.Graphics[];
  animate: (delta: number) => void;
};

export abstract class PuzzleSourceScene extends Phaser.Scene {
  private artwork!: Artwork;

  protected abstract drawArtwork(): Artwork;

  create() {
    this.input.enabled = false;
    this.scene.setVisible(false);
    this.artwork = this.drawArtwork();
  }

  update(_time: number, delta: number) {
    this.artwork.animate(delta);
  }
}
