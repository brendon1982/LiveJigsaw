import Phaser from 'phaser';
import type { PuzzlePiece } from '../domain/Puzzle';
import type { Point } from '../domain/geometry';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';

export function createPuzzlePieceImage(
  scene: Phaser.Scene,
  capture: LivePuzzleCapture,
  piece: PuzzlePiece,
  position: Point,
) {
  const { frame, localPoints } = piece.outline;
  const maskKey = `live-puzzle-mask-${piece.id}`;
  const mask = scene.textures.createCanvas(maskKey, frame.width, frame.height);
  if (!mask) throw new Error(`Could not create mask for ${piece.id}`);

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
  const image = scene.add.image(position.x, position.y, texture.key, piece.id)
    .setOrigin(origin.x / frame.width, origin.y / frame.height)
    .setDisplaySize(frame.width, frame.height);
  image.enableFilters().filters!.internal.addMask(maskKey);
  const hitOutline = localPoints.map(({ x, y }) => ({ x: x * scale, y: y * scale }));
  image.setInteractive(new Phaser.Geom.Polygon(hitOutline), Phaser.Geom.Polygon.Contains);
  scene.input.setDraggable(image);

  return { image, mask };
}
