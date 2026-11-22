import Phaser from 'phaser';
import type { Point, Size } from '../domain/geometry';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';

export class PannableBoard {
  readonly layer: Phaser.GameObjects.Layer;
  readonly camera: Phaser.Cameras.Scene2D.Camera;
  private viewport = new Phaser.Geom.Rectangle();
  private offset: Point;

  constructor(scene: Phaser.Scene, private readonly size: Size, capture: LivePuzzleCapture) {
    this.offset = { x: -size.width / 2, y: -size.height / 2 };
    this.layer = scene.add.layer();
    this.camera = scene.cameras.add().setName('Puzzle board');
    this.camera.inputEnabled = false;
    const guide = scene.add.image(0, 0, capture.texture.key, '__BASE').setOrigin(0)
      .setDisplaySize(size.width, size.height).setAlpha(0.24);
    this.layer.add(guide);
  }

  layout(bounds: Phaser.Geom.Rectangle) {
    const dx = (bounds.width - this.viewport.width) / 2;
    const dy = (bounds.height - this.viewport.height) / 2;
    this.viewport = bounds;
    this.camera.setViewport(bounds.x, bounds.y, bounds.width, bounds.height);
    this.pan(dx, dy);
  }

  contains(point: Point): boolean {
    return this.viewport.contains(point.x, point.y);
  }

  toLocal(point: Point): Point {
    return { x: point.x - this.viewport.x - this.offset.x, y: point.y - this.viewport.y - this.offset.y };
  }

  pan(dx: number, dy: number) {
    this.offset = {
      x: this.limitOffset(this.offset.x + dx, this.viewport.width, this.size.width),
      y: this.limitOffset(this.offset.y + dy, this.viewport.height, this.size.height),
    };
    this.camera.setScroll(-this.offset.x, -this.offset.y);
  }

  private limitOffset(offset: number, viewport: number, content: number): number {
    const center = viewport / 2;
    return Phaser.Math.Clamp(offset, center - content, center);
  }
}
