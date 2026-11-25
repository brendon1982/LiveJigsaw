import assert from 'node:assert/strict';
import { test } from 'node:test';
import { givenPuzzle } from './puzzleScenario.mjs';

test('pieces must be dropped near their own target', () => {
  const game = givenPuzzle({ snapTolerance: 5 });
  const topLeft = game.whenPiece(0, 0);

  assert.equal(topLeft.dropsOn(1, 0), 'missed');
  assert.equal(topLeft.dropsNearTarget({ x: 4, y: 4 }), 'missed');
  game.expectProgress({ placed: 0, total: 4 });

  assert.equal(topLeft.dropsNearTarget({ x: 3, y: 4 }), 'placed');
  game.expectProgress({ placed: 1, total: 4 });
});

test('placing one piece twice does not fill two slots', () => {
  const game = givenPuzzle({ columns: 2, rows: 1 });
  const left = game.whenPiece(0, 0);

  assert.equal(left.dropsOn(0, 0), 'placed');
  assert.equal(left.dropsOn(0, 0), 'already-placed');
  game.expectProgress({ placed: 1, total: 2 });

  assert.equal(game.whenPiece(1, 0).dropsOn(1, 0), 'placed');
  game.expectProgress({ placed: 2, total: 2, complete: true });
});

test('a zero-tolerance single-piece puzzle needs an exact drop', () => {
  const game = givenPuzzle({ columns: 1, rows: 1, snapTolerance: 0 });
  const onlyPiece = game.whenPiece(0, 0);

  assert.equal(onlyPiece.dropsNearTarget({ x: 0.1 }), 'missed');
  assert.equal(onlyPiece.dropsNearTarget(), 'placed');
  game.expectProgress({ placed: 1, total: 1, complete: true });
});

test('placed pieces join only the cut edges they share with already-placed neighbors', () => {
  const game = givenPuzzle({ columns: 3, connectorStyle: 'classic' });
  const upperLeft = game.pieceAt(0, 0);
  const upperMiddle = game.pieceAt(1, 0);
  const lowerMiddle = game.pieceAt(1, 1);

  assert.equal(game.whenPiece(0, 0).dropsOn(0, 0), 'placed');
  assert.deepEqual(game.puzzle.joinedSeams(upperLeft), []);
  assert.equal(game.whenPiece(1, 1).dropsOn(1, 1), 'placed');
  assert.deepEqual(game.puzzle.joinedSeams(lowerMiddle), []);

  assert.equal(game.whenPiece(1, 0).dropsOn(1, 0), 'placed');
  assert.deepEqual(game.puzzle.joinedSeams(upperMiddle), [
    [...lowerMiddle.outline.edges.top].reverse(),
    [...upperLeft.outline.edges.right].reverse(),
  ]);
});

test('a straight joined edge runs from one corner to the other', () => {
  const game = givenPuzzle({ columns: 2, rows: 1, connectorStyle: 'none' });
  assert.equal(game.whenPiece(0, 0).dropsOn(0, 0), 'placed');
  assert.equal(game.whenPiece(1, 0).dropsOn(1, 0), 'placed');
  assert.deepEqual(game.puzzle.joinedSeams(game.pieceAt(1, 0)), [[
    { x: 128, y: 144 },
    { x: 128, y: 0 },
  ]]);
});

test('a drop from outside the puzzle leaves its progress intact', () => {
  const game = givenPuzzle();

  assert.throws(() => game.puzzle.drop('unregistered-piece', { x: 64, y: 72 }), /Unknown piece/);
  game.expectProgress({ placed: 0, total: 4 });
});

test('restoring placements allows the remaining pieces to finish the puzzle', () => {
  const original = givenPuzzle({ columns: 2, rows: 1, seed: 42 });
  assert.equal(original.whenPiece(0, 0).dropsOn(0, 0), 'placed');

  const resumed = givenPuzzle({ columns: 2, rows: 1, seed: 42 });
  assert.equal(resumed.puzzle.restorePlacements(original.puzzle.snapshotPlacements()), true);
  resumed.expectProgress({ placed: 1, total: 2 });
  assert.equal(resumed.whenPiece(0, 0).dropsOn(0, 0), 'already-placed');
  assert.equal(resumed.whenPiece(1, 0).dropsOn(1, 0), 'placed');
  resumed.expectProgress({ placed: 2, total: 2, complete: true });
  original.expectProgress({ placed: 1, total: 2 });
});

test('invalid placement snapshots leave the puzzle progress intact', () => {
  const game = givenPuzzle();
  assert.equal(game.whenPiece(0, 0).dropsOn(0, 0), 'placed');
  const otherPiece = game.pieceAt(1, 0);

  assert.equal(game.puzzle.restorePlacements([otherPiece.id, 'unregistered-piece']), false);
  assert.equal(game.puzzle.restorePlacements([otherPiece.id, otherPiece.id]), false);
  assert.equal(game.whenPiece(0, 0).dropsOn(0, 0), 'already-placed');
  game.expectProgress({ placed: 1, total: 4 });
});
