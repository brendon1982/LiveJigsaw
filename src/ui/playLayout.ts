import { Bounds, type Size } from '../domain/geometry.ts';

export function playWorkspace({ width, height }: Size): Bounds {
  const top = 84;
  return new Bounds(24, top, Math.max(1, width - 48), Math.max(1, height - top - 24));
}
