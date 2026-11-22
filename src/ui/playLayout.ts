import { classicBoard } from '../domain/classicPuzzle.ts';
import { Bounds } from '../domain/geometry.ts';
import { tabDepth } from '../domain/PieceOutline.ts';
import type { PuzzlePiece } from '../domain/Puzzle.ts';

const margin = 16;
const { size, cellSize, columns } = classicBoard;

export const boardBounds = new Bounds(margin, 164, size.width, size.height);
const trayOrigin = { x: boardBounds.x + size.width + 24, y: 144 };
const trayCellWidth = cellSize.width + 2 * tabDepth + 8;
const trayCellHeight = cellSize.height + 2 * tabDepth + 8;

export const gameWidth = trayOrigin.x + columns * trayCellWidth + margin;
export const gameHeight = 540;
export const previewBounds = new Bounds((gameWidth - size.width) / 2, 190, size.width, size.height);
export const trayLabelX = trayOrigin.x;

// TODO: Replace this prototype arrangement when the play screen supports more layouts.
const preferredOrder = [5, 2, 7, 0, 3, 6, 1, 4];

export function arrangeTray(pieces: readonly PuzzlePiece[]): PuzzlePiece[] {
  const indexes = new Set([...preferredOrder, ...pieces.keys()]);
  return [...indexes].filter((index) => index < pieces.length).map((index) => pieces[index]);
}

export function traySlotCenter(slot: number) {
  return {
    x: trayOrigin.x + (slot % columns + 0.5) * trayCellWidth,
    y: trayOrigin.y + (Math.floor(slot / columns) + 0.5) * trayCellHeight,
  };
}
