import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availablePuzzleSizes, createPuzzle, getPieceCount, puzzleSizePresets } from '../../src/domain/puzzleSizes.ts';

test('all five counts offer all five shapes at the shared catalog limit', () => {
  const presets = availablePuzzleSizes({ width: 1920, height: 1020 });
  assert.deepEqual(presets.map(({ square }) => getPieceCount(square)), [32, 64, 128, 288, 420]);
  const proportions = {
    square: [1, 1], 'vertical-long': [4, 7], 'horizontal-long': [7, 4],
    'vertical-short': [4, 5], 'horizontal-short': [5, 4],
  };
  for (const preset of presets) {
    assert.deepEqual(Object.keys(preset).sort(), Object.keys(proportions).sort());
    for (const [shape, [widthRatio, heightRatio]] of Object.entries(proportions)) {
      const puzzle = createPuzzle(preset[shape]);
      const { width, height } = puzzle.board.cellSize;
      assert.equal(puzzle.pieces.length, getPieceCount(preset.square));
      assert.equal(width * heightRatio, height * widthRatio);
      assert.ok(Number.isInteger(width) && Number.isInteger(height));
    }
  }
});

test('a count is offered only when all shapes fit both viewport limits', () => {
  assert.deepEqual(availablePuzzleSizes({ width: 1848, height: 1008 }), puzzleSizePresets);
  assert.deepEqual(availablePuzzleSizes({ width: 1847, height: 1008 }), puzzleSizePresets.slice(0, 4));
  assert.deepEqual(availablePuzzleSizes({ width: 1848, height: 1007 }), puzzleSizePresets.slice(0, 4));
  assert.deepEqual(availablePuzzleSizes({ width: 1024, height: 288 }), []);
});

test('a saved 8-piece setup can still construct its original board', () => {
  const savedSize = { width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 };
  const puzzle = createPuzzle(savedSize);
  assert.equal(puzzle.pieces.length, 8);
  assert.deepEqual(puzzle.board.size, { width: 512, height: 288 });
});
