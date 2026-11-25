import Phaser from 'phaser';
import type { PuzzlePiece } from '../domain/Puzzle';
import { Bounds, type Point } from '../domain/geometry';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';

export class PuzzlePieceView {
  readonly mask: Phaser.Textures.CanvasTexture;
  readonly frame: Bounds;
  private readonly image: Phaser.GameObjects.Image;
  private readonly hitArea: Phaser.Geom.Polygon;
  private grayscale?: Phaser.Filters.ColorMatrix;
  private scale = 1;

  constructor(scene: Phaser.Scene, capture: LivePuzzleCapture, readonly piece: PuzzlePiece) {
    const { frame: outlineBounds, points } = piece.outline;
    const { texture, scale } = capture;
    // Round the crop outward in texture pixels and keep geometry in logical pixels.
    const left = Math.floor(outlineBounds.x * scale);
    const top = Math.floor(outlineBounds.y * scale);
    const width = Math.ceil((outlineBounds.x + outlineBounds.width) * scale) - left;
    const height = Math.ceil((outlineBounds.y + outlineBounds.height) * scale) - top;
    const frame = new Bounds(left / scale, top / scale, width / scale, height / scale);
    this.frame = frame;
    const localPoints = points.map((point) => frame.toLocal(point));
    const maskKey = `live-puzzle-mask-${piece.id}`;
    const mask = scene.textures.createCanvas(maskKey, width, height);
    if (!mask) throw new Error(`Could not create mask for ${piece.id}`);
    this.mask = mask;

    const context = mask.context;
    context.scale(scale, scale);
    context.beginPath();
    context.moveTo(localPoints[0].x, localPoints[0].y);
    for (const point of localPoints.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
    context.fillStyle = '#fff';
    context.fill();
    mask.refresh();

    texture.add(piece.id, 0, left, top, width, height);

    const origin = frame.toLocal(piece.target);
    this.image = scene.add.image(0, 0, texture.key, piece.id)
      .setOrigin(origin.x / frame.width, origin.y / frame.height)
      .setDisplaySize(frame.width, frame.height);
    this.image.enableFilters().filters!.internal.addMask(maskKey);

    const hitPoints = points.map(({ x, y }) => ({ x: x - piece.target.x, y: y - piece.target.y }));
    this.hitArea = new Phaser.Geom.Polygon(hitPoints);
  }

  get position(): Point {
    return this.image;
  }

  contains(point: Point): boolean {
    const { x, y } = this.position;
    return Phaser.Geom.Polygon.Contains(this.hitArea, (point.x - x) / this.scale, (point.y - y) / this.scale);
  }

  moveTo(x: number, y: number) {
    this.image.setPosition(x, y);
  }

  setScale(scale: number) {
    this.scale = scale;
    const { width, height } = this.frame;
    this.image.setDisplaySize(width * scale, height * scale);
  }

  addTo(layer: Phaser.GameObjects.Layer) {
    layer.add(this.image);
  }

  hide() {
    this.image.setVisible(false);
  }

  setGrayscale(enabled: boolean) {
    if (enabled && !this.grayscale) {
      this.grayscale = this.image.filters!.internal.addColorMatrix();
      this.grayscale.colorMatrix.grayscale();
    }
    this.grayscale?.setActive(enabled);
  }
}
