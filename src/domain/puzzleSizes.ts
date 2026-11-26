import { Board } from './Board.ts';
import type { ChallengeMode } from './challengeModes.ts';
import type { ConnectorStyleId } from './connectorStyles.ts';
import type { Size } from './geometry.ts';
import { Puzzle } from './Puzzle.ts';

export type PuzzleSize = Size & Readonly<{
  columns: number;
  rows: number;
  snapTolerance: number;
}>;

export const pieceShapes = {
  'vertical-short': { width: 4, height: 5 },
  'horizontal-short': { width: 5, height: 4 },
  'vertical-long': { width: 4, height: 7 },
  'horizontal-long': { width: 7, height: 4 },
  square: { width: 1, height: 1 },
} as const satisfies Record<string, Size>;
export type PieceShape = keyof typeof pieceShapes;
export const pieceShapeIds = Object.keys(pieceShapes) as PieceShape[];
export const defaultPieceShape: PieceShape = 'vertical-short';

type PieceGrid = readonly [columns: number, rows: number, cellWidth: number, cellHeight: number];
type PuzzleSizePreset = Readonly<Record<PieceShape, PuzzleSize>>;

export const puzzleSizePresets: readonly PuzzleSizePreset[] = [
  definePreset(28, {
    'vertical-short': [10, 4, 117, 156], 'horizontal-short': [8, 5, 150, 128],
    'vertical-long': [10, 4, 108, 173], 'horizontal-long': [8, 5, 173, 108],
    square: [8, 5, 136, 136],
  }),
  definePreset(18, {
    'vertical-short': [12, 6, 90, 104], 'horizontal-short': [12, 6, 104, 90],
    'vertical-long': [18, 4, 70, 133], 'horizontal-long': [9, 8, 125, 75],
    square: [12, 6, 95, 95],
  }),
  definePreset(16, {
    'vertical-short': [18, 8, 61, 73], 'horizontal-short': [16, 9, 73, 63],
    'vertical-long': [24, 6, 49, 93], 'horizontal-long': [12, 12, 92, 49],
    square: [16, 9, 67, 67],
  }),
  definePreset(16, {
    'vertical-short': [25, 12, 63, 73], 'horizontal-short': [20, 15, 78, 58],
    'vertical-long': [30, 10, 53, 85], 'horizontal-long': [20, 15, 85, 53],
    square: [25, 12, 67, 67],
  }),
  definePreset(16, {
    'vertical-short': [30, 14, 60, 69], 'horizontal-short': [28, 15, 68, 59],
    'vertical-long': [35, 12, 50, 80], 'horizontal-long': [21, 20, 86, 48],
    square: [28, 15, 64, 64],
  }),
];

function definePreset(snapTolerance: number, grids: Record<PieceShape, PieceGrid>): PuzzleSizePreset {
  return Object.fromEntries(pieceShapeIds.map((shape) => {
    const [columns, rows, cellWidth, cellHeight] = grids[shape];
    return [shape, { width: columns * cellWidth, height: rows * cellHeight, columns, rows, snapTolerance }];
  })) as PuzzleSizePreset;
}

export function getPieceCount({ columns, rows }: Pick<PuzzleSize, 'columns' | 'rows'>): number {
  return columns * rows;
}

function fitsViewport(size: Size, maximum: Size): boolean {
  return size.width <= maximum.width && size.height <= maximum.height;
}

export function availablePuzzleSizes(maximum: Size): readonly PuzzleSizePreset[] {
  // Keep count and shape independent: every shape must fit for an offered count.
  return puzzleSizePresets.filter((preset) => pieceShapeIds.every((shape) => fitsViewport(preset[shape], maximum)));
}

export function createPuzzle(
  size: PuzzleSize,
  connectorStyle: ConnectorStyleId = 'classic',
  seed = 0,
  challengeMode: ChallengeMode = 'none',
  pieceRotation = false,
): Puzzle {
  const board = new Board(size, size.columns, size.rows);
  return new Puzzle(board, size.snapTolerance, connectorStyle, seed, challengeMode, pieceRotation);
}
