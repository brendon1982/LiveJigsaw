import Phaser from 'phaser';
import type { Bounds, Point } from '../domain/geometry';
import type { PuzzlePiece } from '../domain/Puzzle';
import { BatchedPieceImage } from '../rendering/BatchedPieceImage';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import { borderFrameName, type PieceMask } from '../rendering/PieceMaskAtlas';
import { styleWithTheme } from './theme';

export class PuzzlePieceView {
  readonly frame: Bounds;
  private readonly image: BatchedPieceImage;
  private readonly hitArea: Phaser.Geom.Polygon;
  private readonly visibleBounds = new Phaser.Geom.Rectangle();
  private parkedBorder?: Phaser.GameObjects.Image;
  private scale = 1;

  constructor(scene: Phaser.Scene, capture: LivePuzzleCapture, readonly piece: PuzzlePiece, mask: PieceMask) {
    const { texture, frame } = mask;
    this.frame = frame;
    const origin = frame.toLocal(piece.target);
    this.image = new BatchedPieceImage(scene, texture, piece.id, capture.texture, frame)
      .setDisplayOrigin(origin.x, origin.y);

    const hitPoints = piece.outline.points.map(({ x, y }) => ({ x: x - piece.target.x, y: y - piece.target.y }));
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
    this.parkedBorder?.setScale(scale);
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
      const { scene, artwork, texture } = this.image;
      const border = new BatchedPieceImage(scene, texture,
        borderFrameName(this.piece.id), artwork, this.frame, true).setName('Parked piece border');
      const paddingX = (border.width - this.frame.width) / 2;
      const paddingY = (border.height - this.frame.height) / 2;
      border.setDisplayOrigin(this.image.displayOriginX + paddingX, this.image.displayOriginY + paddingY);
      styleWithTheme(border, (colors) => border.setTint(colors.border));
      this.parkedBorder = border;
    }
  }

  setGrayscale(enabled: boolean) {
    this.image.grayscale = enabled;
  }
}
