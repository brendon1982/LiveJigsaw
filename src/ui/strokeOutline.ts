import type Phaser from 'phaser';
import type { Point } from '../domain/geometry';

export function strokeOutline(graphics: Phaser.GameObjects.Graphics, points: readonly Point[]) {
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
  graphics.closePath();
  graphics.strokePath();
}
