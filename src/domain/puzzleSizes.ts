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

type PieceGrid = readonly [columns: number, rows: number, cellScale: number];
type PuzzleSizePreset = Readonly<Record<PieceShape, PuzzleSize>>;

export const puzzleSizePresets: readonly PuzzleSizePreset[] = [
  definePreset(28, {
    square: [8, 4, 136], 'vertical-long': [8, 4, 26], 'horizontal-long': [8, 4, 26],
    'vertical-short': [8, 4, 30], 'horizontal-short': [8, 4, 30],
  }),
  definePreset(18, {
    square: [8, 8, 96], 'vertical-long': [16, 4, 18], 'horizontal-long': [8, 8, 18],
    'vertical-short': [16, 4, 21], 'horizontal-short': [8, 8, 21],
  }),
  definePreset(16, {
    square: [16, 8, 68], 'vertical-long': [16, 8, 13], 'horizontal-long': [16, 8, 13],
    'vertical-short': [16, 8, 15], 'horizontal-short': [16, 8, 15],
  }),
  definePreset(16, {
    square: [24, 12, 68], 'vertical-long': [32, 9, 13], 'horizontal-long': [18, 16, 13],
    'vertical-short': [24, 12, 15], 'horizontal-short': [18, 16, 15],
  }),
  definePreset(16, {
    square: [28, 15, 66], 'vertical-long': [35, 12, 12], 'horizontal-long': [21, 20, 12],
    'vertical-short': [30, 14, 14], 'horizontal-short': [28, 15, 13],
  }),
];

function definePreset(snapTolerance: number, grids: Record<PieceShape, PieceGrid>): PuzzleSizePreset {
  return Object.fromEntries(pieceShapeIds.map((shape) => {
    const [columns, rows, cellScale] = grids[shape];
    const proportions = pieceShapes[shape];
    const cellWidth = proportions.width * cellScale;
    const cellHeight = proportions.height * cellScale;
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
