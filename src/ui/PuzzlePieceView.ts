import Phaser from 'phaser';
import type { PuzzlePiece } from '../domain/Puzzle';
import type { Point } from '../domain/geometry';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';

export class PuzzlePieceView {
  readonly mask: Phaser.Textures.CanvasTexture;
  private readonly image: Phaser.GameObjects.Image;
  private readonly hitArea: Phaser.Geom.Polygon;
  private scale = 1;

  constructor(scene: Phaser.Scene, capture: LivePuzzleCapture, readonly piece: PuzzlePiece) {
    const { frame, localPoints } = piece.outline;
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

    const { texture, scale } = capture;
    texture.add(piece.id, 0, frame.x * scale, frame.y * scale, frame.width * scale, frame.height * scale);

    const origin = frame.toLocal(piece.target);
    this.image = scene.add.image(0, 0, texture.key, piece.id)
      .setOrigin(origin.x / frame.width, origin.y / frame.height)
      .setDisplaySize(frame.width, frame.height);
    this.image.enableFilters().filters!.internal.addMask(maskKey);

    const points = piece.outline.points.map(({ x, y }) => ({ x: x - piece.target.x, y: y - piece.target.y }));
    this.hitArea = new Phaser.Geom.Polygon(points);
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
    const { width, height } = this.piece.outline.frame;
    this.image.setDisplaySize(width * scale, height * scale);
  }

  addTo(layer: Phaser.GameObjects.Layer) {
    layer.add(this.image);
  }

  hide() {
    this.image.setVisible(false);
  }
}
