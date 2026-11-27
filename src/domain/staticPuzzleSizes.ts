import type { Size } from './geometry.ts';
import { getPieceCount, pieceShapeIds, pieceShapes, puzzleSizePresets, type PuzzleSize, type PuzzleSizePreset } from './puzzleSizes.ts';

const countVariance = 0.2;
const targetPresets = puzzleSizePresets.map(({ square }) => ({
  count: getPieceCount(square), area: square.width * square.height, snapTolerance: square.snapTolerance,
}));
export const maximumPuzzlePieceCount = Math.floor(Math.max(...targetPresets.map(({ count }) => count)) * (1 + countVariance));

export function staticPuzzleSizes(artwork: Size) {
  return targetPresets.flatMap(({ count, area, snapTolerance }) => {
    const board = fitArtworkToArea(artwork, area);
    const grids = candidateGrids(board, count);
    if (!grids.length) return [];

    const preset = Object.fromEntries(pieceShapeIds.map((shape) => {
      const grid = bestFitGrid(grids, pieceShapes[shape], count);
      const tolerance = Math.min(snapTolerance, grid.cellWidth / 3, grid.cellHeight / 3);
      const size: PuzzleSize = { ...board, columns: grid.columns, rows: grid.rows, snapTolerance: tolerance };
      return [shape, size];
    })) as PuzzleSizePreset;
    return [{ targetCount: count, preset }];
  });
}

function fitArtworkToArea({ width, height }: Size, targetArea: number): Size {
  const scale = Math.min(1, Math.sqrt(targetArea / (width * height)));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function candidateGrids({ width, height }: Size, targetCount: number) {
  const minCount = Math.ceil(targetCount * (1 - countVariance));
  const maxCount = Math.floor(targetCount * (1 + countVariance));
  const grids = [];
  for (let rows = 1; rows <= Math.min(height, maxCount); rows += 1) {
    const minColumns = Math.ceil(minCount / rows);
    const maxColumns = Math.min(width, Math.floor(maxCount / rows));
    for (let columns = minColumns; columns <= maxColumns; columns += 1) {
      grids.push({ columns, rows, cellWidth: width / columns, cellHeight: height / rows });
    }
  }
  return grids;
}

function bestFitGrid(grids: ReturnType<typeof candidateGrids>, shape: Size, targetCount: number) {
  const idealAspect = shape.width / shape.height;
  let best = grids[0];
  let bestError = Infinity;
  for (const grid of grids) {
    const aspectRatio = (grid.cellWidth / grid.cellHeight) / idealAspect;
    const error = Math.abs(Math.log(aspectRatio));
    const sameShape = Math.abs(error - bestError) < 1e-12;
    const countDistance = Math.abs(getPieceCount(grid) - targetCount);
    if (sameShape ? countDistance < Math.abs(getPieceCount(best) - targetCount) : error < bestError) {
      best = grid;
      bestError = error;
    }
  }
  return best;
}