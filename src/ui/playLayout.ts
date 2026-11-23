import { Bounds, type Size } from '../domain/geometry.ts';
import { headerInset, puzzleHeader } from './puzzleHeader';

export function playWorkspace({ width, height }: Size): Bounds {
  const top = puzzleHeader(width).height;
  return new Bounds(headerInset, top, Math.max(1, width - 2 * headerInset), Math.max(1, height - top - headerInset));
}
