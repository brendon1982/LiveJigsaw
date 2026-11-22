import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availablePuzzleSizes, captureScale, createPuzzle, puzzleSizes } from '../../src/domain/puzzleSizes.ts';

const [classic, large] = puzzleSizes;

test('the engine offers only puzzle sizes that fit both source dimensions', () => {
  assert.deepEqual(availablePuzzleSizes({ width: 1024, height: 288 }), [classic]);
  assert.deepEqual(availablePuzzleSizes({ width: 1024, height: 576 }), [classic, large]);
  assert.deepEqual(availablePuzzleSizes({ width: 511, height: 576 }), []);
  const puzzle = createPuzzle(large);
  assert.deepEqual(puzzle.board.size, { width: 1024, height: 576 });
  assert.equal(puzzle.pieces.length, 32);
});

test('supersampling respects the source and GPU limits', () => {
  const maximum = { width: 1024, height: 576 };
  assert.equal(captureScale(classic, maximum, 2048), 2);
  assert.equal(captureScale(large, maximum, 2048), 1);
  assert.equal(captureScale(classic, maximum, 768), 1);
  assert.throws(() => captureScale(large, maximum, 768), RangeError);
});
