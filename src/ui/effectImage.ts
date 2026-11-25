import Phaser from 'phaser';
import type { Bounds, Point } from '../domain/geometry';

export const effectImageResolution = 3;

// Composite each effect before applying opacity to avoid blending overlapping stroke segments on screen.
export function drawEffectImage(
  scene: Phaser.Scene,
  bounds: Bounds,
  padding: number,
  anchor: Point,
  draw: (context: CanvasRenderingContext2D) => void,
) {
  const left = bounds.x - padding;
  const top = bounds.y - padding;
  const resolution = effectImageResolution;
  const pixelWidth = Math.ceil((bounds.width + 2 * padding) * resolution);
  const pixelHeight = Math.ceil((bounds.height + 2 * padding) * resolution);
  const key = `placement-effect-${Phaser.Utils.String.UUID()}`;
  const texture = scene.textures.createCanvas(key, pixelWidth, pixelHeight);
  if (!texture) throw new Error('Could not create a placement effect texture');

  const { context } = texture;
  context.setTransform(resolution, 0, 0, resolution, -left * resolution, -top * resolution);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  draw(context);
  texture.refresh();

  const image = scene.add.image(anchor.x, anchor.y, texture)
    .setOrigin((anchor.x - left) * resolution / pixelWidth, (anchor.y - top) * resolution / pixelHeight)
    .setScale(1 / resolution);
  image.once(Phaser.GameObjects.Events.DESTROY, () => texture.manager.remove(texture));
  return image;
}

export function traceEffectPath(context: CanvasRenderingContext2D, points: readonly Point[]) {
  const [start, ...rest] = points;
  context.moveTo(start.x, start.y);
  for (const point of rest) context.lineTo(point.x, point.y);
}
