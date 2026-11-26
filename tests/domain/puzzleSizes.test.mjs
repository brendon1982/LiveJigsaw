import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availablePuzzleSizes, createPuzzle, puzzleSizes } from '../../src/domain/puzzleSizes.ts';

const [size32, size64, size128] = puzzleSizes;

test('the engine offers only puzzle sizes that fit both source dimensions', () => {
  assert.deepEqual(availablePuzzleSizes({ width: 1024, height: 288 }), []);
  assert.deepEqual(availablePuzzleSizes({ width: 1024, height: 576 }), puzzleSizes);
  assert.deepEqual(availablePuzzleSizes({ width: 511, height: 576 }), []);
});

test('denser presets keep the large viewport and use smaller pieces and snap tolerances', () => {
  const [standard, many, most] = [size32, size64, size128].map((size) => createPuzzle(size));
  assert.deepEqual([standard.pieces.length, many.pieces.length, most.pieces.length], [32, 64, 128]);
  assert.deepEqual([standard.board.cellSize, many.board.cellSize, most.board.cellSize], [
    { width: 128, height: 144 }, { width: 128, height: 72 }, { width: 64, height: 72 },
  ]);
  for (const [puzzle, tolerance] of [[standard, 28], [many, 18], [most, 16]]) {
    assert.deepEqual(puzzle.board.size, { width: 1024, height: 576 });
    const { id, target } = puzzle.pieces[0];
    assert.equal(puzzle.drop(id, { x: target.x + tolerance + 1, y: target.y }), 'missed');
    assert.equal(puzzle.drop(id, { x: target.x + tolerance, y: target.y }), 'placed');
  }
});

test('a saved 8-piece setup can still construct its original board', () => {
  const savedSize = { width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 };
  const puzzle = createPuzzle(savedSize);
  assert.equal(puzzle.pieces.length, 8);
  assert.deepEqual(puzzle.board.size, { width: 512, height: 288 });
});
