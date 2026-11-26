import assert from 'node:assert/strict';
import { test } from 'node:test';
import { givenPuzzle } from './puzzleScenario.mjs';

test('rotation has its own seeded starting orientations and defaults to off', () => {
  const options = { columns: 4, seed: 42 };
  const { puzzle: off } = givenPuzzle(options);
  const { puzzle: on } = givenPuzzle({ ...options, pieceRotation: true });
  const { puzzle: repeated } = givenPuzzle({ ...options, pieceRotation: true });
  assert.deepEqual(on.trayPieces, off.trayPieces);
  assert.deepEqual(on.snapshot(), repeated.snapshot());
  assert.ok(on.trayPieces.some(({ id }) => on.orientationOf(id) !== 0));
  assert.ok(off.trayPieces.every(({ id }) => off.orientationOf(id) === 0));
  assert.equal(off.turnPiece(off.trayPieces[0].id), false);
});

test('a sideways drop returns before seed connection is checked and preserves the turn', () => {
  const { puzzle, pieceAt, whenPiece } = givenPuzzle({ pieceRotation: true, challengeMode: 'seed' });
  const first = pieceAt(0, 0);
  while (puzzle.orientationOf(first.id) !== 0) assert.equal(puzzle.turnPiece(first.id), true);
  assert.equal(whenPiece(0, 0).dropsNearTarget(), 'placed');
  assert.equal(puzzle.turnPiece(first.id), false);

  const opposite = pieceAt(1, 1);
  if (puzzle.orientationOf(opposite.id) === 0) assert.equal(puzzle.turnPiece(opposite.id), true);
  const sideways = puzzle.orientationOf(opposite.id);
  assert.equal(whenPiece(1, 1).dropsNearTarget(), 'wrong-orientation');
  assert.equal(puzzle.orientationOf(opposite.id), sideways);
  assert.ok(puzzle.trayPieces.includes(opposite));
  for (let turn = sideways; turn < 4; turn += 1) {
    assert.equal(puzzle.turnPiece(opposite.id), true);
    assert.equal(puzzle.orientationOf(opposite.id), (turn + 1) % 4);
  }
  assert.equal(whenPiece(1, 1).dropsNearTarget(), 'disconnected-from-seed');
});

test('orientation-only progress restores atomically and locked pieces cannot turn', () => {
  const options = { pieceRotation: true, challengeMode: 'sequential', seed: 42 };
  const { puzzle, whenTrayPiece } = givenPuzzle(options);
  const first = whenTrayPiece(0).piece.id;
  const locked = whenTrayPiece(1).piece.id;
  assert.equal(puzzle.turnPiece(locked), false);
  assert.equal(puzzle.turnPiece(first), true);
  const snapshot = puzzle.snapshot();
  assert.deepEqual(snapshot.placedPieceIds, []);

  const { puzzle: resumed } = givenPuzzle(options);
  assert.equal(resumed.restore(snapshot), true);
  assert.deepEqual(resumed.snapshot(), snapshot);
  assert.equal(resumed.restore({ ...snapshot, placedPieceIds: [first] }), false);
  assert.equal(resumed.restore({ ...snapshot, trayOrientations: { ...snapshot.trayOrientations, [first]: 4 } }), false);
  assert.deepEqual(resumed.snapshot(), snapshot);
});