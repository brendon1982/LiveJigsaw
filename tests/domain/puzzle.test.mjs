import assert from 'node:assert/strict';
import { test } from 'node:test';
import { givenPuzzle } from './puzzleScenario.mjs';

test('Sequential advances only when the first remaining piece is placed', () => {
  const { whenTrayPiece, expectProgress } = givenPuzzle({ challengeMode: 'sequential' });
  const first = whenTrayPiece(0);
  const second = whenTrayPiece(1);
  assert.equal(second.dropsOnTarget(), 'blocked');
  assert.equal(first.dropsNearTarget(11), 'missed');
  assert.equal(second.dropsOnTarget(), 'blocked');
  assert.equal(first.dropsOnTarget(), 'placed');
  assert.equal(second.dropsOnTarget(), 'placed');
  expectProgress({ placed: 2, total: 4 });
});

test('Sequential Window makes the next piece available when any of the first four is placed', () => {
  const { puzzle, whenTrayPiece } = givenPuzzle({ columns: 3, challengeMode: 'sequential-window' });
  const fourth = whenTrayPiece(3);
  const fifth = whenTrayPiece(4);
  assert.equal(fifth.dropsOnTarget(), 'blocked');
  assert.equal(fourth.dropsOnTarget(), 'placed');
  assert.equal(puzzle.canDrag(fifth.piece.id), true);
  assert.equal(fifth.dropsOnTarget(), 'placed');
});

test('a saved seed and placements restore the remaining tray in the same order', () => {
  const options = { columns: 3, challengeMode: 'sequential-window', seed: 42 };
  const { puzzle, whenTrayPiece } = givenPuzzle(options);
  assert.equal(whenTrayPiece(2).dropsOnTarget(), 'placed');
  const { puzzle: resumed } = givenPuzzle(options);
  assert.equal(resumed.restore(puzzle.snapshot()), true);
  assert.deepEqual(resumed.trayPieces.map(({ id }) => id), puzzle.trayPieces.map(({ id }) => id));
});

test('Seed accepts any first piece and expands only through shared edges', () => {
  const { puzzle, whenPiece, pieceAt, expectProgress } = givenPuzzle({ connectorStyle: 'none', challengeMode: 'seed' });
  assert.equal(whenPiece(1, 1).dropsNearTarget(), 'placed');
  const disconnected = whenPiece(0, 0);
  assert.equal(puzzle.canDrag(pieceAt(0, 0).id), true);
  assert.equal(disconnected.dropsNearTarget({ x: 11 }), 'missed');
  assert.equal(disconnected.dropsNearTarget(), 'disconnected-from-seed');
  expectProgress({ placed: 1, total: 4 });
  assert.deepEqual(puzzle.snapshot().placedPieceIds, [pieceAt(1, 1).id]);
  assert.ok(puzzle.trayPieces.includes(pieceAt(0, 0)));
  assert.equal(whenPiece(1, 0).dropsNearTarget(), 'placed');
  assert.equal(disconnected.dropsNearTarget(), 'placed');
  assert.equal(whenPiece(0, 1).dropsNearTarget(), 'placed');
  expectProgress({ placed: 4, total: 4, complete: true });
});

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
  assert.equal(resumed.puzzle.restore(original.puzzle.snapshot()), true);
  resumed.expectProgress({ placed: 1, total: 2 });
  assert.equal(resumed.whenPiece(0, 0).dropsOn(0, 0), 'already-placed');
  assert.equal(resumed.whenPiece(1, 0).dropsOn(1, 0), 'placed');
  resumed.expectProgress({ placed: 2, total: 2, complete: true });
  original.expectProgress({ placed: 1, total: 2 });
});

test('Sequential restores a later tray piece without requiring the earlier pieces', () => {
  const { puzzle, whenTrayPiece, expectProgress } = givenPuzzle({ challengeMode: 'sequential' });
  const first = whenTrayPiece(0);
  const second = whenTrayPiece(1);
  const third = whenTrayPiece(2);

  assert.equal(puzzle.restore({ placedPieceIds: [second.piece.id], trayOrientations: {} }), true);
  expectProgress({ placed: 1, total: 4 });
  assert.equal(second.dropsOnTarget(), 'already-placed');
  assert.equal(third.dropsOnTarget(), 'blocked');
  assert.equal(first.dropsOnTarget(), 'placed');
  assert.equal(third.dropsOnTarget(), 'placed');
});

test('Seed restores disconnected pieces but still checks new drops for a shared edge', () => {
  const { puzzle, pieceAt, whenPiece, expectProgress } = givenPuzzle({ columns: 3, challengeMode: 'seed' });
  const disconnectedSnapshot = [pieceAt(0, 0).id, pieceAt(1, 1).id];

  assert.equal(puzzle.restore({ placedPieceIds: disconnectedSnapshot, trayOrientations: {} }), true);
  expectProgress({ placed: 2, total: 6 });
  assert.deepEqual(puzzle.snapshot().placedPieceIds, disconnectedSnapshot);
  assert.equal(whenPiece(2, 0).dropsNearTarget(), 'disconnected-from-seed');
  assert.equal(whenPiece(2, 1).dropsNearTarget(), 'placed');
  assert.equal(whenPiece(2, 0).dropsNearTarget(), 'placed');
});

test('invalid placement snapshots leave the puzzle progress intact', () => {
  const game = givenPuzzle();
  assert.equal(game.whenPiece(0, 0).dropsOn(0, 0), 'placed');
  const otherPiece = game.pieceAt(1, 0);

  assert.equal(game.puzzle.restore({ placedPieceIds: [otherPiece.id, 'unregistered-piece'], trayOrientations: {} }), false);
  assert.equal(game.puzzle.restore({ placedPieceIds: [otherPiece.id, otherPiece.id], trayOrientations: {} }), false);
  assert.equal(game.whenPiece(0, 0).dropsOn(0, 0), 'already-placed');
  game.expectProgress({ placed: 1, total: 4 });
});
