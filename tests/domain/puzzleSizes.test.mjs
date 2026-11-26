import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availablePuzzleSizes, createPuzzle, getPieceCount, puzzleSizePresets } from '../../src/domain/puzzleSizes.ts';

test('all five counts offer all five shapes at the shared catalog limit', () => {
  const presets = availablePuzzleSizes({ width: 1920, height: 1020 });
  assert.deepEqual(presets.map(({ square }) => getPieceCount(square)), [40, 72, 144, 300, 420]);
  const aspectRanges = {
    square: [1, 1], 'vertical-long': [1 / 1.9, 1 / 1.6], 'horizontal-long': [1.6, 1.9],
    'vertical-short': [1 / 1.35, 1 / 1.15], 'horizontal-short': [1.15, 1.35],
  };
  const areaTargets = { 40: 18500, 72: 9100, 144: 4550, 300: 4550, 420: 4150 };
  for (const preset of presets) {
    const count = getPieceCount(preset.square);
    assert.deepEqual(Object.keys(preset).sort(), Object.keys(aspectRanges).sort());
    for (const [shape, [minimum, maximum]] of Object.entries(aspectRanges)) {
      const puzzle = createPuzzle(preset[shape]);
      const { width, height } = puzzle.board.cellSize;
      assert.equal(puzzle.pieces.length, count);
      assert.ok(Number.isInteger(width) && Number.isInteger(height));
      assert.ok(width / height >= minimum && width / height <= maximum, `${count} ${shape} proportions`);
      assert.ok(Math.abs(width * height / areaTargets[count] - 1) <= 0.04, `${count} ${shape} area`);
    }
  }
});

test('a count is offered only when all shapes fit both viewport limits', () => {
  assert.deepEqual(availablePuzzleSizes({ width: 1904, height: 966 }), puzzleSizePresets);
  assert.deepEqual(availablePuzzleSizes({ width: 1903, height: 966 }), puzzleSizePresets.slice(0, 4));
  assert.deepEqual(availablePuzzleSizes({ width: 1904, height: 965 }), puzzleSizePresets.slice(0, 4));
  assert.deepEqual(availablePuzzleSizes({ width: 1024, height: 288 }), []);
});

test('a saved 8-piece setup can still construct its original board', () => {
  const savedSize = { width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 };
  const puzzle = createPuzzle(savedSize);
  assert.equal(puzzle.pieces.length, 8);
  assert.deepEqual(puzzle.board.size, { width: 512, height: 288 });
});
