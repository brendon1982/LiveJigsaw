import { Bounds, type Size } from '../domain/geometry.ts';
import type { TrayPosition } from '../persistence/GameSave';
import { puzzleSpacing } from './puzzleHeader';

export function playWorkspace({ width, height }: Size, headerBottom: number): Bounds {
  const top = headerBottom + puzzleSpacing;
  return new Bounds(0, top, Math.max(1, width), Math.max(1, height - top));
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
