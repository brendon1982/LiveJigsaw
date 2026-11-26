import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bounds } from '../../src/domain/geometry.ts';
import { givenPuzzle } from './puzzleScenario.mjs';

const roomyWorkspace = new Bounds(-500, -450, 1500, 1250);

test('bulk parking shuffles tray pieces into separate slots outside the guide and preserves their turns', () => {
  const setup = { columns: 4, rows: 3, cell: { width: 100, height: 140 }, seed: 7, pieceRotation: true };
  const { board, play, pieceAt, expectProgress } = givenPuzzle(setup);
  const [anchor, member, singleton, placed] = [0, 1, 2, 3].map((column) => pieceAt(column, 0));
  turnTo(play, anchor, 1);
  turnTo(play, member, 1);
  turnTo(play, singleton, 3);
  turnTo(play, placed, 0);
  assert.equal(play.dropOnBoard(anchor.id, { x: -65, y: 50 }).kind, 'parked');
  assert.equal(play.dropOnBoard(member.id, { x: -65, y: 150 }).kind, 'joined');
  assert.equal(play.dropOnBoard(singleton.id, { x: 200, y: -55 }).kind, 'parked');
  assert.equal(play.dropOnBoard(placed.id, placed.target).kind, 'placed');

  const existingGroups = play.parkedGroups;
  const trayTurns = new Map(play.trayPieces.map(({ id }) => [id, play.orientationOf(id)]));
  const originalOrder = [...trayTurns.keys()];
  assert.equal(play.moveTrayToBoard(roomyWorkspace, true, () => 0), true);

  expectProgress({ placed: 1, total: 12 });
  assert.deepEqual(play.trayPieces, []);
  for (const group of existingGroups) assert.equal(play.groupOf(group.anchorPieceId), group);
  const newGroups = play.parkedGroups.slice(existingGroups.length);
  assert.deepEqual(newGroups.map(({ anchorPieceId }) => anchorPieceId), [...originalOrder.slice(1), originalOrder[0]]);
  const occupied = [anchor, member, singleton].map((piece) => parkedFrame(play, piece));
  const guide = new Bounds(0, 0, board.size.width, board.size.height);
  for (const [id, turns] of trayTurns) {
    assert.deepEqual(play.groupOf(id).memberIds, [id]);
    assert.equal(play.orientationOf(id), turns);
    const frame = parkedFrame(play, play.puzzle.pieceById(id));
    assertInside(frame, roomyWorkspace);
    assert.equal(overlaps(frame, guide), false, `${id} covers the guide`);
    assert.ok(occupied.every((other) => !overlaps(frame, other)), `${id} overlaps another piece`);
    occupied.push(frame);
  }
  assert.equal(play.moveTrayToBoard(roomyWorkspace, true), false);
  assertRestores(setup, play);
});

test('bulk parking leaves the puzzle untouched when disabled or in Seed mode', () => {
  for (const [challengeMode, allowLoosePieces] of [['none', false], ['seed', true]]) {
    const { play } = givenPuzzle({ challengeMode });
    const before = play.snapshot();
    assert.equal(play.moveTrayToBoard(roomyWorkspace, allowLoosePieces), false);
    assert.deepEqual(play.snapshot(), before);
    assert.equal(play.trayPieces.length, 4);
  }
});

test('bulk parking can use empty space on the guide when the perimeter is full, without snapping', () => {
  const { board, play, pieceAt, expectProgress } = givenPuzzle({ columns: 3, rows: 1, connectorStyle: 'none' });
  const workspace = new Bounds(0, 0, board.size.width, board.size.height);
  const placed = pieceAt(1, 0);
  assert.equal(play.dropOnBoard(placed.id, placed.target).kind, 'placed');
  const left = pieceAt(0, 0);
  const right = pieceAt(2, 0);
  const keepLeftFirst = () => play.trayPieces[0] === left ? 0.75 : 0;
  assert.equal(play.moveTrayToBoard(workspace, true, keepLeftFirst), true);

  assert.deepEqual(play.positionOf(left.id), left.target);
  assert.deepEqual(play.positionOf(right.id), right.target);
  expectProgress({ placed: 1, total: 3 });
  assert.deepEqual(play.trayPieces, []);
});

test('bulk parking falls back to overlap in a saturated workspace without joining a parked neighbor', () => {
  const { board, play, pieceAt, expectProgress } = givenPuzzle({ columns: 4, rows: 1, connectorStyle: 'none' });
  const blocker = pieceAt(0, 0);
  const neighbor = pieceAt(1, 0);
  const workspace = new Bounds(-300, -250, board.cellSize.width, board.cellSize.height);
  const blockerPosition = { x: workspace.center.x - board.cellSize.width, y: workspace.center.y };
  assert.equal(play.dropOnBoard(blocker.id, blockerPosition).kind, 'parked');
  assert.equal(play.moveTrayToBoard(workspace, true, () => 0), true);

  assert.deepEqual(play.positionOf(blocker.id), blockerPosition);
  assert.deepEqual(play.groupOf(blocker.id).memberIds, [blocker.id]);
  assert.deepEqual(play.groupOf(neighbor.id).memberIds, [neighbor.id]);
  for (const column of [1, 2, 3]) assertInside(parkedFrame(play, pieceAt(column, 0)), workspace);
  assert.ok(overlaps(parkedFrame(play, neighbor), parkedFrame(play, pieceAt(2, 0))));
  assert.deepEqual(play.trayPieces, []);
  expectProgress({ placed: 0, total: 4 });
});

test('bulk parking favors less overlap over a slot closer to the guide', () => {
  const { board, play, pieceAt } = givenPuzzle({ columns: 2, rows: 1, connectorStyle: 'none' });
  const { width, height } = board.cellSize;
  const workspace = new Bounds(-300, -250, width + 20, height);
  const blocker = pieceAt(0, 0);
  const blockerPosition = { x: workspace.center.x + 10, y: workspace.center.y };
  assert.equal(play.dropOnBoard(blocker.id, blockerPosition).kind, 'parked');
  assert.equal(play.moveTrayToBoard(workspace, true), true);

  assert.deepEqual(play.positionOf(pieceAt(1, 0).id), { x: blockerPosition.x - 20, y: blockerPosition.y });
});

test('bulk parking keeps centers reachable even when a rotated piece cannot fit', () => {
  const { play } = givenPuzzle({ pieceRotation: true });
  const workspace = new Bounds(34, -28, 3, 1);
  assert.equal(play.moveTrayToBoard(workspace, true, () => 0), true);
  assert.deepEqual(play.trayPieces, []);
  for (const { position } of play.parkedGroups) assertInside(new Bounds(position.x, position.y, 0, 0), workspace);
});

test('bulk parking in Sequential keeps later pieces gated and saves their parked state', () => {
  const setup = { columns: 2, rows: 1, challengeMode: 'sequential' };
  const { board, play } = givenPuzzle(setup);
  const [first, next] = play.trayPieces;
  const area = new Bounds(-500, -300, 150, 160);
  assert.equal(play.moveTrayToBoard(area, true, () => 0), true);
  assert.deepEqual(play.trayPieces, []);
  assert.equal(play.dropOnBoard(next.id, next.target).guideResult, 'blocked');

  const nextPosition = play.positionOf(next.id);
  const adjacent = { x: nextPosition.x + first.target.x - next.target.x, y: nextPosition.y };
  assert.equal(Math.abs(adjacent.x - nextPosition.x), board.cellSize.width);
  assert.equal(play.dropOnBoard(first.id, adjacent).kind, 'parked');
  const resumed = assertRestores(setup, play);
  assert.equal(resumed.dropOnBoard(first.id, first.target).kind, 'placed');
  assert.equal(resumed.dropOnBoard(next.id, next.target).kind, 'placed');
});

test('edge sorting bundles perimeter singles and clears the gap without splitting rotated blockers', () => {
  const setup = { columns: 5, rows: 4, cell: { width: 80, height: 80 }, connectorStyle: 'none', pieceRotation: true };
  const { play, pieceAt, expectProgress } = givenPuzzle(setup);
  const corner = pieceAt(0, 0);
  const edge = pieceAt(4, 1);
  const anchor = pieceAt(2, 3);
  const member = pieceAt(3, 3);
  const interior = pieceAt(1, 1);
  const unaffected = pieceAt(3, 2);
  const placed = pieceAt(2, 1);
  const target = { x: -230, y: -150 };
  turnTo(play, edge, 3);
  turnTo(play, anchor, 1);
  turnTo(play, member, 1);
  turnTo(play, placed, 0);
  assert.equal(play.dropOnBoard(corner.id, { x: -400, y: -350 }).kind, 'parked');
  assert.equal(play.dropOnBoard(edge.id, { x: 640, y: -180 }).kind, 'parked');
  assert.equal(play.dropOnBoard(anchor.id, { x: -140, y: -190 }).kind, 'parked');
  assert.equal(play.dropOnBoard(member.id, { x: -140, y: -110 }).kind, 'joined');
  assert.equal(play.dropOnBoard(interior.id, { x: -320, y: -150 }).kind, 'parked');
  assert.equal(play.dropOnBoard(unaffected.id, { x: 500, y: 420 }).kind, 'parked');
  assert.equal(play.dropOnBoard(placed.id, placed.target).kind, 'placed');

  const original = play.groupOf(anchor.id);
  const untouched = play.groupOf(unaffected.id);
  const interiorStart = play.positionOf(interior.id);
  const tray = play.trayPieces;
  assert.equal(play.hasSortableParkedEdges, true);
  assert.equal(play.sortParkedEdges(target, roomyWorkspace, () => 0), true);

  const bundle = bundleFrame(play, [corner, edge]);
  assert.deepEqual(bundle.center, target);
  assert.ok(Math.max(bundle.width, bundle.height) < 170);
  assert.equal(overlaps(parkedFrame(play, corner), parkedFrame(play, edge)), false);
  assert.ok(play.positionOf(edge.id).y < play.positionOf(corner.id).y, 'the shuffle swaps the two slots');
  assert.equal(play.orientationOf(edge.id), 3);
  assert.deepEqual(play.groupOf(corner.id).memberIds, [corner.id]);
  assert.deepEqual(play.groupOf(edge.id).memberIds, [edge.id]);

  const moved = play.groupOf(anchor.id);
  assert.notDeepEqual(moved.position, original.position);
  assert.deepEqual(moved.memberIds, original.memberIds);
  assert.equal(moved.anchorPieceId, original.anchorPieceId);
  assert.equal(moved.quarterTurns, original.quarterTurns);
  assert.deepEqual(play.positionOf(member.id), { x: moved.position.x, y: moved.position.y + 80 });
  assert.notDeepEqual(play.positionOf(interior.id), interiorStart);
  assert.equal(play.groupOf(unaffected.id), untouched);

  const gap = new Bounds(bundle.x - 20, bundle.y - 20, bundle.width + 40, bundle.height + 40);
  const blockers = [anchor, member, interior].map((piece) => parkedFrame(play, piece));
  for (const frame of blockers) {
    assertInside(frame, roomyWorkspace);
    assert.equal(overlaps(frame, gap), false);
  }
  assert.equal(overlaps(blockers[0], blockers[2]) || overlaps(blockers[1], blockers[2]), false);
  assert.deepEqual(play.trayPieces, tray);
  expectProgress({ placed: 1, total: 20 });
  assert.equal(play.puzzle.isPlaced(placed.id), true);
  assertRestores(setup, play);
});

test('edge sorting clamps a compact bundle inward at each workspace corner', () => {
  const workspace = new Bounds(-500, -400, 360, 380);
  for (const x of [workspace.x, workspace.x + workspace.width]) {
    for (const y of [workspace.y, workspace.y + workspace.height]) {
      const { play, pieceAt } = givenPuzzle({ cell: { width: 80, height: 80 }, pieceRotation: true });
      const edges = [pieceAt(0, 0), pieceAt(0, 1), pieceAt(1, 1)];
      edges.forEach((piece, index) => {
        turnTo(play, piece, index);
        assert.equal(play.dropOnBoard(piece.id, { x: -400 + index * 100, y: -180 }).kind, 'parked');
      });
      assert.equal(play.sortParkedEdges({ x, y }, workspace, () => 0), true);
      const bundle = bundleFrame(play, edges);
      assertInside(bundle, workspace);
      assert.ok(Math.abs(bundle.center.x - x) < workspace.width / 2);
      assert.ok(Math.abs(bundle.center.y - y) < workspace.height / 2);
      const frames = edges.map((piece) => parkedFrame(play, piece));
      assert.ok(frames.every((frame, index) => frames.slice(index + 1).every((other) => !overlaps(frame, other))));
    }
  }
});

test('edge sorting prefers overlapping outside the gap to leaving a blocker in it', () => {
  const { play, pieceAt } = givenPuzzle({ columns: 4, rows: 3, cell: { width: 80, height: 80 }, connectorStyle: 'none' });
  const workspace = new Bounds(-500, -250, 220, 80);
  const edge = pieceAt(0, 0);
  const blocker = pieceAt(1, 1);
  const fixed = pieceAt(2, 1);
  assert.equal(play.dropOnBoard(edge.id, { x: -400, y: -400 }).kind, 'parked');
  assert.equal(play.dropOnBoard(blocker.id, { x: -430, y: -210 }).kind, 'parked');
  assert.equal(play.dropOnBoard(fixed.id, { x: -320, y: -210 }).kind, 'parked');
  const fixedGroup = play.groupOf(fixed.id);

  assert.equal(play.sortParkedEdges({ x: -440, y: -210 }, workspace, () => 0), true);

  const moved = parkedFrame(play, blocker);
  assertInside(moved, workspace);
  assert.ok(moved.x >= parkedFrame(play, edge).x + 100);
  assert.ok(overlaps(moved, parkedFrame(play, fixed)));
  assert.equal(play.groupOf(fixed.id), fixedGroup);
});

test('edge sorting avoids locked pieces near the target without claiming an empty guide slot', () => {
  const { play, pieceAt, expectProgress } = givenPuzzle({ columns: 3, rows: 1, cell: { width: 80, height: 80 }, connectorStyle: 'none' });
  const edge = pieceAt(0, 0);
  const placed = pieceAt(1, 0);
  const workspace = new Bounds(0, 0, 240, 80);
  assert.equal(play.dropOnBoard(placed.id, placed.target).kind, 'placed');
  assert.equal(play.dropOnBoard(edge.id, { x: -300, y: -300 }).kind, 'parked');

  const before = play.snapshot();
  assert.equal(play.sortParkedEdges({ x: NaN, y: 40 }, workspace), false);
  assert.deepEqual(play.snapshot(), before);
  assert.equal(play.sortParkedEdges({ x: 100, y: 40 }, workspace), true);
  assert.deepEqual(play.positionOf(edge.id), edge.target);
  assert.equal(overlaps(parkedFrame(play, edge), placed.outline.frame), false);
  expectProgress({ placed: 1, total: 3 });
});

test('edge sorting finishes with overlap when the bundle itself cannot fit', () => {
  const { play, pieceAt, expectProgress } = givenPuzzle({ cell: { width: 80, height: 80 }, connectorStyle: 'none' });
  const workspace = new Bounds(-500, -300, 80, 80);
  const edges = [pieceAt(0, 0), pieceAt(1, 1)];
  for (const [index, piece] of edges.entries()) {
    assert.equal(play.dropOnBoard(piece.id, { x: -400, y: -180 + index * 100 }).kind, 'parked');
  }
  assert.equal(play.sortParkedEdges(workspace.center, workspace, () => 0), true);
  for (const piece of edges) {
    assertInside(parkedFrame(play, piece), workspace);
    assert.deepEqual(play.groupOf(piece.id).memberIds, [piece.id]);
  }
  assert.ok(overlaps(parkedFrame(play, edges[0]), parkedFrame(play, edges[1])));
  assert.equal(play.sortParkedEdges(workspace.center, workspace, () => 0), false);
  expectProgress({ placed: 0, total: 4 });
});

test('edge sorting refuses Seed mode and ignores trays, interior singles, and joined edges', () => {
  const seed = givenPuzzle({ challengeMode: 'seed' });
  assert.equal(seed.play.dropOnBoard(seed.pieceAt(0, 0).id, { x: -300, y: -300 }).kind, 'parked');
  const seedSave = seed.play.snapshot();
  assert.equal(seed.play.hasSortableParkedEdges, false);
  assert.equal(seed.play.sortParkedEdges(roomyWorkspace.center, roomyWorkspace), false);
  assert.deepEqual(seed.play.snapshot(), seedSave);

  const { play, pieceAt } = givenPuzzle({ columns: 3, rows: 3, cell: { width: 80, height: 80 } });
  assert.equal(play.dropOnBoard(pieceAt(1, 1).id, { x: -200, y: -200 }).kind, 'parked');
  assert.equal(play.dropOnBoard(pieceAt(0, 0).id, { x: -400, y: -400 }).kind, 'parked');
  assert.equal(play.dropOnBoard(pieceAt(1, 0).id, { x: -320, y: -400 }).kind, 'joined');
  const before = play.snapshot();
  assert.equal(play.hasSortableParkedEdges, false);
  assert.equal(play.sortParkedEdges(roomyWorkspace.center, roomyWorkspace), false);
  assert.deepEqual(play.snapshot(), before);
});

function assertRestores(setup, play) {
  const saved = JSON.parse(JSON.stringify(play.snapshot()));
  const resumed = givenPuzzle(setup).play;
  assert.equal(resumed.restore(saved), true);
  assert.deepEqual(resumed.snapshot(), saved);
  assert.deepEqual(resumed.trayPieces.map(({ id }) => id), play.trayPieces.map(({ id }) => id));
  return resumed;
}

function turnTo(play, piece, turns) {
  while (play.orientationOf(piece.id) !== turns) assert.equal(play.turnPiece(piece.id), true);
}

function parkedFrame(play, piece) {
  const position = play.positionOf(piece.id);
  const angle = play.orientationOf(piece.id) * Math.PI / 2;
  const cos = Math.round(Math.cos(angle));
  const sin = Math.round(Math.sin(angle));
  return Bounds.around(piece.outline.points.map((point) => {
    const { x, y } = piece.cell.bounds.toLocal(point);
    const dx = x - piece.cell.bounds.width / 2;
    const dy = y - piece.cell.bounds.height / 2;
    return { x: position.x + dx * cos - dy * sin, y: position.y + dx * sin + dy * cos };
  }));
}

function bundleFrame(play, pieces) {
  return Bounds.around(pieces.flatMap((piece) => {
    const { x, y, width, height } = parkedFrame(play, piece);
    return [{ x, y }, { x: x + width, y: y + height }];
  }));
}

function assertInside(inner, outer) {
  const tolerance = 1e-8;
  assert.ok(inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance);
  assert.ok(inner.x + inner.width <= outer.x + outer.width + tolerance);
  assert.ok(inner.y + inner.height <= outer.y + outer.height + tolerance);
}

function overlaps(a, b) {
  const tolerance = 1e-8;
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > tolerance
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > tolerance;
}