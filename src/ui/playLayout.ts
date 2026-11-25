import { Bounds, type Size } from '../domain/geometry.ts';
import type { TrayPosition } from '../persistence/GameSave';
import { headerInset, puzzleHeader } from './puzzleHeader';

export function playHeader(width: number) {
  return puzzleHeader(width, 620);
}

export function playWorkspace({ width, height }: Size): Bounds {
  const top = playHeader(width).height;
  return new Bounds(headerInset, top, Math.max(1, width - 2 * headerInset), Math.max(1, height - top - headerInset));
}

export type TraySide = Exclude<TrayPosition, 'Auto'>;
export type TrayScrollAxis = 'x' | 'y';

export function resolveTraySide(position: TrayPosition, { width, height }: Size): TraySide {
  if (position !== 'Auto') return position;
  return width >= height ? 'Left' : 'Bottom';
}

export function trayScrollAxis(side: TraySide): TrayScrollAxis {
  return side === 'Left' || side === 'Right' ? 'y' : 'x';
}
