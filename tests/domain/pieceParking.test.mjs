import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PuzzlePlay } from '../../src/domain/PuzzlePlay.ts';
import { givenPuzzle } from './puzzleScenario.mjs';

const offGuide = { x: -500, y: 600 };

function offset(point, x, y = 0) {
  return { x: point.x + x, y: point.y + y };
}

function turnTo(play, piece, quarterTurns) {
  const turns = (quarterTurns - play.orientationOf(piece.id) + 4) % 4;
  for (let i = 0; i < turns; i += 1) assert.equal(play.turnPiece(piece.id), true);
}

test('loose pieces park on either side of the guide by default, unless disallowed', () => {
  const { play, pieceAt, expectProgress } = givenPuzzle();
  const first = pieceAt(0, 0);
  const second = pieceAt(1, 0);
  const overGuide = offset(first.target, 20);

  assert.equal(play.dropOnBoard(first.id, overGuide, false).kind, 'returned');
  assert.ok(play.trayPieces.includes(first));
  assert.equal(play.dropOnBoard(first.id, overGuide).kind, 'parked');
  assert.equal(play.dropOnBoard(second.id, overGuide).kind, 'parked');
  assert.deepEqual(play.parkedGroups.map(({ anchorPieceId }) => anchorPieceId), [first.id, second.id]);
  assert.equal(play.trayPieces.includes(first), false);
  assert.deepEqual(play.positionOf(first.id), overGuide);
  assert.deepEqual(play.positionOf(second.id), overGuide);

  const resting = play.snapshot();
  assert.equal(play.dropOnBoard(first.id, offGuide, false).kind, 'unchanged');
  assert.deepEqual(play.snapshot(), resting);
  assert.equal(play.dropOnBoard(first.id, offGuide).kind, 'parked');
  assert.deepEqual(play.positionOf(first.id), offGuide);
  assert.equal(play.parkedGroups.at(-1).anchorPieceId, first.id);
  expectProgress({ placed: 0, total: 4 });
});

test('singles join with either setting, then two groups join through a member other than the grabbed member', () => {
  const { play, pieceAt } = givenPuzzle({ columns: 4, rows: 1 });
  const [a, b, c, d] = [0, 1, 2, 3].map((column) => pieceAt(column, 0));
  play.dropOnBoard(a.id, offGuide);
  assert.equal(play.dropOnBoard(b.id, offset(offGuide, 132), false).kind, 'joined');
  assert.deepEqual(play.positionOf(b.id), offset(offGuide, 128));

  play.dropOnBoard(c.id, offset(offGuide, 500));
  assert.equal(play.dropOnBoard(d.id, offset(offGuide, 627)).kind, 'joined');
  const resting = play.snapshot();
  assert.equal(play.dropOnBoard(d.id, offset(offGuide, 700), false).kind, 'unchanged');
  assert.deepEqual(play.snapshot(), resting);

  assert.equal(play.dropOnBoard(d.id, offset(offGuide, 387)).kind, 'joined');
  assert.deepEqual(play.groupOf(d.id).memberIds, [a.id, b.id, c.id, d.id]);
  assert.deepEqual(play.positionOf(a.id), offGuide);
  assert.deepEqual(play.positionOf(d.id), offset(offGuide, 384));
  assert.equal(play.parkedGroups.length, 1);
});

test('join picks the closest matching neighbor, with a stable tie break', () => {
  for (const [attempt, winner] of [[127, 0], [132, 2], [129, 2]]) {
    const { play, pieceAt } = givenPuzzle({ columns: 3, rows: 1 });
    const [left, middle, right] = [0, 1, 2].map((column) => pieceAt(column, 0));
    play.dropOnBoard(left.id, offGuide);
    play.dropOnBoard(right.id, offset(offGuide, 258));

    assert.equal(play.dropOnBoard(middle.id, offset(offGuide, attempt)).kind, 'joined');
    assert.equal(play.groupOf(middle.id).anchorPieceId, pieceAt(winner, 0).id);
    assert.deepEqual(play.positionOf(middle.id), offset(offGuide, winner === 0 ? 128 : 130));
    assert.equal(play.parkedGroups.length, 2);
  }
});

test('a diagonal neighbor, a wrong offset, or mismatched turns do not join', () => {
  const { play, pieceAt } = givenPuzzle({ pieceRotation: true });
  const a = pieceAt(0, 0);
  const b = pieceAt(1, 0);
  const diagonal = pieceAt(1, 1);
  turnTo(play, a, 1);
  turnTo(play, b, 0);
  turnTo(play, diagonal, 1);
  play.dropOnBoard(a.id, offGuide);
  assert.equal(play.dropOnBoard(diagonal.id, offset(offGuide, -144, 128), false).kind, 'returned');
  assert.equal(play.dropOnBoard(b.id, offset(offGuide, 0, 128), false).kind, 'returned');
  turnTo(play, b, 1);
  assert.equal(play.dropOnBoard(b.id, offset(offGuide, 128, 128), false).kind, 'returned');
  assert.equal(play.dropOnBoard(b.id, offset(offGuide, 4, 130)).kind, 'joined');
  assert.deepEqual(play.positionOf(b.id), offset(offGuide, 0, 128));
});

test('rotating a parked group pivots around the clicked member, and returning it preserves turns and seeded order', () => {
  const { play, pieceAt } = givenPuzzle({ seed: 54, pieceRotation: true });
  const top = pieceAt(0, 0);
  const bottom = pieceAt(0, 1);
  const loose = pieceAt(1, 0);
  const originalOrder = play.trayPieces;
  turnTo(play, top, 0);
  turnTo(play, bottom, 0);
  play.dropOnBoard(top.id, offGuide);
  play.dropOnBoard(bottom.id, offset(offGuide, 0, 144));
  play.dropOnBoard(loose.id, offGuide);

  assert.equal(play.turnPiece(bottom.id), true);
  assert.equal(play.parkedGroups.at(-1), play.groupOf(bottom.id));
  assert.deepEqual(play.positionOf(bottom.id), offset(offGuide, 0, 144));
  assert.deepEqual(play.positionOf(top.id), offset(offGuide, 144, 144));
  assert.equal(play.groupOf(top.id).quarterTurns, 1);
  assert.equal(top.id in play.snapshot().trayOrientations, false);
  assert.equal(bottom.id in play.snapshot().trayOrientations, false);

  assert.equal(play.returnToTray(loose.id), true);
  assert.equal(play.returnToTray(bottom.id), true);
  assert.equal(play.returnToTray(bottom.id), false);
  assert.deepEqual(play.parkedGroups, []);
  assert.deepEqual(play.trayPieces, originalOrder);
  assert.equal(play.orientationOf(top.id), 1);
  assert.equal(play.orientationOf(bottom.id), 1);
});

test('detaching a rotated bridge moves it sideways and leaves the remaining components in place', () => {
  const { play, puzzle, pieceAt } = givenPuzzle({ columns: 5, rows: 1, pieceRotation: true });
  const pieces = [0, 1, 2, 3, 4].map((column) => pieceAt(column, 0));
  pieces.forEach((piece, i) => {
    turnTo(play, piece, 1);
    play.dropOnBoard(piece.id, offset(offGuide, 0, i * 128));
  });
  const [a, b, bridge, d, e] = pieces.map(({ id }) => id);
  assert.equal(play.parkedGroups.length, 1);

  assert.equal(play.breakOff(bridge), true);
  assert.deepEqual(play.parkedGroups.map(({ memberIds }) => memberIds), [[a, b], [d, e], [bridge]]);
  pieces.forEach(({ id }, i) => {
    if (id === bridge) return;
    assert.deepEqual(play.positionOf(id), offset(offGuide, 0, i * 128));
    assert.equal(play.orientationOf(id), 1);
  });
  const previous = offset(offGuide, 0, 256);
  const detached = play.positionOf(bridge);
  assert.equal(detached.y, previous.y);
  assert.ok(Math.abs(detached.x - previous.x) > puzzle.snapTolerance);
  assert.ok(Math.abs(detached.x - previous.x) < 32);
  assert.equal(play.orientationOf(bridge), 1);
  assert.equal(play.breakOff(bridge), false);
  assert.equal(play.dropOnBoard(bridge, detached).kind, 'parked');
  assert.equal(play.dropOnBoard(bridge, previous).kind, 'joined');
  assert.equal(play.parkedGroups.length, 2);
});

test('a surrounded piece still separates without moving its neighbors', () => {
  const { play, puzzle, pieceAt } = givenPuzzle({ columns: 3, rows: 3 });
  const center = pieceAt(1, 1);
  const neighbors = [pieceAt(1, 0), pieceAt(2, 1), pieceAt(1, 2), pieceAt(0, 1)];
  play.dropOnBoard(center.id, offGuide);
  for (const { id, target } of neighbors) {
    assert.equal(play.dropOnBoard(id, offset(offGuide, target.x - center.target.x, target.y - center.target.y)).kind, 'joined');
  }
  const positions = neighbors.map(({ id }) => play.positionOf(id));

  assert.equal(play.breakOff(center.id), true);
  const detached = play.positionOf(center.id);
  assert.ok(Math.hypot(detached.x - offGuide.x, detached.y - offGuide.y) > puzzle.snapTolerance);
  assert.deepEqual(neighbors.map(({ id }) => play.positionOf(id)), positions);
});

test('upright guide placement takes priority over an eligible loose join', () => {
  const { play, pieceAt, expectProgress } = givenPuzzle();
  const a = pieceAt(0, 0);
  const b = pieceAt(1, 0);
  play.dropOnBoard(a.id, offset(a.target, 11));
  assert.deepEqual(play.dropOnBoard(b.id, offset(b.target, 5)), {
    kind: 'placed', guideResult: 'placed', lockedPieceIds: [b.id],
  });
  assert.deepEqual(play.groupOf(a.id).memberIds, [a.id]);
  expectProgress({ placed: 1, total: 4 });
});

test('locking a group is atomic and the final group completes a No Guide puzzle', () => {
  const { play, puzzle, pieceAt, expectProgress } = givenPuzzle({ columns: 2, rows: 1, pieceRotation: true, challengeMode: 'no-guide' });
  const a = pieceAt(0, 0);
  const b = pieceAt(1, 0);
  turnTo(play, a, 1);
  turnTo(play, b, 1);
  play.dropOnBoard(a.id, offGuide);
  play.dropOnBoard(b.id, offset(offGuide, 0, 128));
  assert.equal(puzzle.hidesGuide, true);

  assert.equal(play.dropOnBoard(b.id, b.target).guideResult, 'wrong-orientation');
  turnTo(play, b, 0);
  assert.equal(play.dropOnBoard(b.id, offset(b.target, 11), false).guideResult, 'missed');
  expectProgress({ placed: 0, total: 2 });
  assert.deepEqual(play.dropOnBoard(b.id, offset(b.target, 10)).lockedPieceIds, [a.id, b.id]);
  assert.deepEqual(play.parkedGroups, []);
  assert.deepEqual(play.trayPieces, []);
  expectProgress({ placed: 2, total: 2, complete: true });
});

for (const [challengeMode, slots] of [['sequential', 1], ['sequential-window', 4]]) {
  test(`${challengeMode}: parking does not free an eligibility slot`, () => {
    const { play, puzzle } = givenPuzzle({ columns: 6, rows: 1, seed: 42, challengeMode });
    const seeded = play.trayPieces;
    seeded.slice(0, slots).forEach((piece, i) => {
      assert.equal(play.dropOnBoard(piece.id, offset(offGuide, i * 450)).kind, 'parked');
    });
    const next = seeded[slots];
    assert.equal(play.trayPieces[0], next);
    assert.equal(puzzle.canDrag(next.id), false);
    assert.equal(play.dropOnBoard(next.id, next.target).guideResult, 'blocked');
    assert.equal(play.dropOnBoard(seeded[0].id, seeded[0].target).kind, 'placed');
    assert.equal(play.dropOnBoard(next.id, next.target).kind, 'placed');
  });
}

test('locking a joined group opens one Sequential Window slot per member', () => {
  const { play, puzzle } = givenPuzzle({ columns: 6, rows: 1, challengeMode: 'sequential-window' });
  const eligible = play.trayPieces.slice(0, 4);
  const blocked = play.trayPieces.slice(4);
  const left = eligible.find((piece) => eligible.some((other) => other.cell.column === piece.cell.column + 1));
  const right = eligible.find((piece) => piece.cell.column === left.cell.column + 1);

  play.dropOnBoard(left.id, offGuide);
  assert.equal(play.dropOnBoard(right.id, offset(offGuide, 128)).kind, 'joined');
  assert.ok(blocked.every(({ id }) => !puzzle.canDrag(id)));
  assert.deepEqual(play.dropOnBoard(right.id, right.target).lockedPieceIds, [left.id, right.id]);
  assert.ok(blocked.every(({ id }) => puzzle.canDrag(id)));
});

test('Seed rejects a disconnected later group and accepts it once any member touches the seed', () => {
  const { play, pieceAt, expectProgress } = givenPuzzle({ columns: 5, rows: 1, challengeMode: 'seed' });
  const [a, b, bridge, d, e] = [0, 1, 2, 3, 4].map((i) => pieceAt(i, 0));
  play.dropOnBoard(a.id, offGuide);
  play.dropOnBoard(b.id, offset(offGuide, 128));
  assert.deepEqual(play.dropOnBoard(b.id, b.target).lockedPieceIds, [a.id, b.id]);

  play.dropOnBoard(d.id, offGuide);
  play.dropOnBoard(e.id, offset(offGuide, 128));
  assert.deepEqual(play.dropOnBoard(e.id, e.target, false), {
    kind: 'unchanged', guideResult: 'disconnected-from-seed', lockedPieceIds: [],
  });
  expectProgress({ placed: 2, total: 5 });
  assert.deepEqual(play.positionOf(d.id), offGuide);
  assert.deepEqual(play.dropOnBoard(e.id, e.target), {
    kind: 'parked', guideResult: 'disconnected-from-seed', lockedPieceIds: [],
  });
  expectProgress({ placed: 2, total: 5 });
  play.dropOnBoard(d.id, offGuide);
  assert.equal(play.dropOnBoard(bridge.id, offset(offGuide, -128)).kind, 'joined');
  assert.deepEqual(play.dropOnBoard(e.id, e.target).lockedPieceIds, [d.id, e.id, bridge.id]);
  expectProgress({ placed: 5, total: 5, complete: true });
});

test('parking-only snapshots round trip with order, geometry, and separate tray orientations', () => {
  const setup = { columns: 3, rows: 2, seed: 31, pieceRotation: true };
  const { play, pieceAt } = givenPuzzle(setup);
  const a = pieceAt(0, 0);
  const b = pieceAt(1, 0);
  const c = pieceAt(2, 1);
  turnTo(play, a, 3);
  turnTo(play, b, 3);
  turnTo(play, c, 2);
  play.dropOnBoard(a.id, offGuide);
  play.dropOnBoard(b.id, offset(offGuide, 0, -128));
  play.dropOnBoard(c.id, c.target);
  const saved = JSON.parse(JSON.stringify(play.snapshot()));
  assert.deepEqual(saved.placedPieceIds, []);
  assert.equal(saved.parkedGroups.length, 2);
  assert.equal(Object.keys(saved.trayOrientations).length, 3);

  const resumed = givenPuzzle(setup).play;
  assert.equal(resumed.restore(saved), true);
  assert.deepEqual(resumed.snapshot(), saved);
  assert.deepEqual(resumed.positionOf(b.id), offset(offGuide, 0, -128));
  assert.deepEqual(resumed.trayPieces.map(({ id }) => id), play.trayPieces.map(({ id }) => id));
});

test('combined restore rejects invalid groups and overlapping homes without changing any existing state', () => {
  const { play, puzzle, pieceAt } = givenPuzzle({ pieceRotation: true });
  const a = pieceAt(0, 0).id;
  const b = pieceAt(1, 0).id;
  const diagonal = pieceAt(1, 1).id;
  play.dropOnBoard(a, offGuide);
  const before = play.snapshot();
  const [group] = before.parkedGroups;
  for (const invalid of [
    { parkedGroups: [group, group] },
    { parkedGroups: [{ ...group, memberIds: [a, a] }] },
    { parkedGroups: [{ ...group, memberIds: [a, 'unknown'] }] },
    { parkedGroups: [{ ...group, memberIds: [a, diagonal] }] },
    { parkedGroups: [{ ...group, anchorPieceId: b }] },
    { parkedGroups: [{ ...group, position: { x: Infinity, y: 0 } }] },
    { parkedGroups: [{ ...group, quarterTurns: 1.5 }] },
    { parkedGroups: [{ ...group, quarterTurns: 4 }] },
    { placedPieceIds: [a] },
    { placedPieceIds: [b, b] },
    { trayOrientations: { ...before.trayOrientations, [a]: 1 } },
    { trayOrientations: { ...before.trayOrientations, [diagonal]: undefined, [a]: 0 } },
  ]) {
    assert.equal(play.restore({ ...before, ...invalid }), false);
    assert.deepEqual(play.snapshot(), before);
  }
  assert.equal(puzzle.restore(before), false);
  assert.equal(puzzle.drop(a, pieceAt(0, 0).target), 'blocked');
  assert.throws(() => new PuzzlePlay(puzzle), /already has a workspace/);
  assert.deepEqual(play.snapshot(), before);
});

test('restore tests eligibility against restored placements and rejects turns when rotation is disabled', () => {
  const { play } = givenPuzzle({ challengeMode: 'sequential' });
  const [first, second] = play.trayPieces;
  const group = { memberIds: [second.id], anchorPieceId: second.id, position: offGuide, quarterTurns: 0 };
  const snapshot = { placedPieceIds: [], trayOrientations: {}, parkedGroups: [group] };
  assert.equal(play.restore(snapshot), false);
  assert.equal(play.restore({ ...snapshot, placedPieceIds: [first.id] }), true);
  assert.equal(play.restore({ ...play.snapshot(), parkedGroups: [{ ...group, quarterTurns: 1 }] }), false);
  assert.equal(play.turnPiece(second.id), false);
  assert.deepEqual(play.positionOf(second.id), offGuide);
});