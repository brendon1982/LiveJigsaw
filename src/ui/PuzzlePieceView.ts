import Phaser from 'phaser';
import type { PuzzlePiece } from '../domain/Puzzle';
import { Bounds, type Point } from '../domain/geometry';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';

export class PuzzlePieceView {
  readonly mask: Phaser.Textures.CanvasTexture;
  readonly frame: Bounds;
  private readonly image: Phaser.GameObjects.Image;
  private readonly hitArea: Phaser.Geom.Polygon;
  private readonly visibleBounds = new Phaser.Geom.Rectangle();
  private grayscale?: Phaser.Filters.ColorMatrix;
  private scale = 1;

  constructor(scene: Phaser.Scene, capture: LivePuzzleCapture, readonly piece: PuzzlePiece) {
    const { frame: outlineBounds, points } = piece.outline;
    const { texture } = capture;
    // Round the texture crop outward to include the full outline.
    const left = Math.floor(outlineBounds.x);
    const top = Math.floor(outlineBounds.y);
    const width = Math.ceil(outlineBounds.x + outlineBounds.width) - left;
    const height = Math.ceil(outlineBounds.y + outlineBounds.height) - top;
    const frame = new Bounds(left, top, width, height);
    this.frame = frame;
    const localPoints = points.map((point) => frame.toLocal(point));
    const maskKey = `live-puzzle-mask-${piece.id}`;
    const mask = scene.textures.createCanvas(maskKey, width, height);
    if (!mask) throw new Error(`Could not create mask for ${piece.id}`);
    this.mask = mask;

    const context = mask.context;
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
      .setOrigin(origin.x / frame.width, origin.y / frame.height);
    this.image.enableFilters().filters!.internal.addMask(maskKey);

    const hitPoints = points.map(({ x, y }) => ({ x: x - piece.target.x, y: y - piece.target.y }));
    this.hitArea = new Phaser.Geom.Polygon(hitPoints);
  }

  get position(): Point {
    return this.image;
  }

  contains(point: Point): boolean {
    const { x, y } = this.position;
    const dx = (point.x - x) / this.scale;
    const dy = (point.y - y) / this.scale;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return Phaser.Geom.Polygon.Contains(this.hitArea, dx * cos + dy * sin, dy * cos - dx * sin);
  }

  intersects(bounds: Phaser.Geom.Rectangle): boolean {
    return Phaser.Geom.Intersects.RectangleToRectangle(this.image.getBounds(this.visibleBounds), bounds);
  }

  get rotation(): number {
    return this.image.rotation;
  }

  setOrientation(quarterTurns: number) {
    this.image.setAngle(quarterTurns * 90);
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

  setVisible(visible: boolean) {
    this.image.setVisible(visible);
  }

  setGrayscale(enabled: boolean) {
    if (enabled && !this.grayscale) {
      this.grayscale = this.image.filters!.internal.addColorMatrix();
      this.grayscale.colorMatrix.grayscale();
    }
    this.grayscale?.setActive(enabled);
  }
}
