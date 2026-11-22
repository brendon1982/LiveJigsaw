import { Bounds, type Size } from '../domain/geometry.ts';

export function playWorkspace({ width, height }: Size): Bounds {
  return new Bounds(24, 140, Math.max(1, width - 48), Math.max(1, height - 164));
}
