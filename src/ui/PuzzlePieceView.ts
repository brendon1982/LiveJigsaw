import Phaser from 'phaser';
import type { PuzzlePiece } from '../domain/Puzzle';
import { Bounds, type Point, type Size } from '../domain/geometry';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import { drawEffectImage, effectImageResolution, traceEffectPath } from './effectImage';
import { styleWithTheme } from './theme';

function pieceRenderFrame(frame: Bounds, captureSize: Size): Bounds {
  const { x, y, width, height } = frame;
  if (!Phaser.Math.Pow2.IsSize(width, height)) return frame;

  // Phaser repeats power-of-two filter outputs. Add a transparent texel outside the outline
  // to make the render target non-power-of-two without changing the piece or tray slot.
  if (width > 1 && width < captureSize.width) {
    const left = x + width < captureSize.width ? x : x - 1;
    return new Bounds(left, y, width + 1, height);
  }
  if (height > 1 && height < captureSize.height) {
    const top = y + height < captureSize.height ? y : y - 1;
    return new Bounds(x, top, width, height + 1);
  }
  return frame;
}

export class PuzzlePieceView {
  readonly mask: Phaser.Textures.CanvasTexture;
  readonly frame: Bounds;
  private readonly image: Phaser.GameObjects.Image;
  private readonly hitArea: Phaser.Geom.Polygon;
  private readonly visibleBounds = new Phaser.Geom.Rectangle();
  private grayscale?: Phaser.Filters.ColorMatrix;
  private parkedBorder?: Phaser.GameObjects.Image;
  private scale = 1;

  constructor(scene: Phaser.Scene, capture: LivePuzzleCapture, readonly piece: PuzzlePiece) {
    const { frame: outlineBounds, points } = piece.outline;
    const { texture } = capture;
    // Round the texture crop outward to include the full outline.
    const left = Math.floor(outlineBounds.x);
    const top = Math.floor(outlineBounds.y);
    const right = Math.ceil(outlineBounds.x + outlineBounds.width);
    const bottom = Math.ceil(outlineBounds.y + outlineBounds.height);
    this.frame = new Bounds(left, top, right - left, bottom - top);
    const frame = pieceRenderFrame(this.frame, texture);
    const localPoints = points.map((point) => frame.toLocal(point));
    const maskKey = `live-puzzle-mask-${piece.id}`;
    const mask = scene.textures.createCanvas(maskKey, frame.width, frame.height);
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
    mask.setWrap(Phaser.Textures.WrapMode.CLAMP_TO_EDGE);

    texture.add(piece.id, 0, frame.x, frame.y, frame.width, frame.height);

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
    return Phaser.Geom.Intersects.RectangleToRectangle(this.bounds, bounds);
  }

  get bounds(): Phaser.Geom.Rectangle {
    return this.image.getBounds(this.visibleBounds);
  }

  get rotation(): number {
    return this.image.rotation;
  }

  setOrientation(quarterTurns: number) {
    this.image.setAngle(quarterTurns * 90);
    this.parkedBorder?.setAngle(this.image.angle);
  }

  moveTo(x: number, y: number) {
    this.image.setPosition(x, y);
    this.parkedBorder?.setPosition(x, y);
  }

  setScale(scale: number) {
    this.scale = scale;
    this.image.setScale(scale);
    this.parkedBorder?.setScale(scale / effectImageResolution);
  }

  addTo(layer: Phaser.GameObjects.Layer, index?: number) {
    if (index === undefined) {
      layer.add(this.image);
      layer.bringToTop(this.image);
    } else layer.addAt(this.image, index);
    if (this.parkedBorder) {
      layer.add(this.parkedBorder);
      layer.bringToTop(this.parkedBorder);
    }
  }

  setVisible(visible: boolean) {
    this.image.setVisible(visible);
    this.parkedBorder?.setVisible(visible);
  }

  setParked(parked: boolean) {
    if (!parked) {
      this.parkedBorder?.destroy();
      this.parkedBorder = undefined;
    } else if (!this.parkedBorder) {
      const { outline, target } = this.piece;
      const border = drawEffectImage(this.image.scene, outline.frame, 2, target, (context) => {
        context.beginPath();
        traceEffectPath(context, outline.points);
        context.closePath();
        context.lineWidth = 1;
        context.strokeStyle = '#fff';
        context.stroke();
      }).setName('Parked piece border');
      styleWithTheme(border, (colors) => border.setTint(colors.border));
      this.parkedBorder = border;
    }
  }

  setGrayscale(enabled: boolean) {
    if (enabled && !this.grayscale) {
      this.grayscale = this.image.filters!.internal.addColorMatrix();
      this.grayscale.colorMatrix.grayscale();
    }
    this.grayscale?.setActive(enabled);
  }
}
