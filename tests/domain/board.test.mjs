import assert from 'node:assert/strict';
import { test } from 'node:test';
import { givenPuzzle } from './puzzleScenario.mjs';

function sharedPoints(first, second) {
  return first.outline.points.filter(({ x, y }) =>
    second.outline.points.some((point) => point.x === x && point.y === y));
}

test('the board controls the number, targets, and unique identities of pieces', () => {
  const game = givenPuzzle({ columns: 3, rows: 2, cell: { width: 100, height: 80 } });

  game.expectProgress({ placed: 0, total: 6 });
  assert.equal(new Set(game.puzzle.pieces.map(({ id }) => id)).size, 6);
  assert.deepEqual(game.pieceAt(2, 1).target, { x: 250, y: 120 });
});

test('neighboring tabs and sockets follow the same outline on both axes', () => {
  const game = givenPuzzle();
  const [topLeft, topRight, bottomLeft] = game.puzzle.pieces;
  const [leftCell] = game.board.cells;
  const { width, height } = leftCell.bounds;

  const insideVerticalSeam = ({ y }) => y > 0 && y < height;
  const insideHorizontalSeam = ({ x }) => x > 0 && x < width;
  const vertical = sharedPoints(topLeft, topRight).filter(insideVerticalSeam);
  const horizontal = sharedPoints(topLeft, bottomLeft).filter(insideHorizontalSeam);
  assert.ok(vertical.some(({ x }) => x > width), 'The vertical seam should share its tab');
  assert.ok(horizontal.some(({ y }) => y > height), 'The horizontal seam should share its tab');
  assert.deepEqual(vertical, sharedPoints(topRight, topLeft).filter(insideVerticalSeam).reverse());
  assert.deepEqual(horizontal, sharedPoints(bottomLeft, topLeft).filter(insideHorizontalSeam).reverse());
});

test('small pieces stay inside the board and their frames preserve the local outline', () => {
  const game = givenPuzzle({ columns: 3, rows: 2, cell: { width: 25, height: 30 } });

  for (const { outline: { frame, points, localPoints } } of game.puzzle.pieces) {
    for (const [index, point] of points.entries()) {
      assert.ok(point.x >= 0 && point.x <= game.board.size.width);
      assert.ok(point.y >= 0 && point.y <= game.board.size.height);
      assert.deepEqual(localPoints[index], { x: point.x - frame.x, y: point.y - frame.y });
    }
  }
});

test('varied connector profiles follow the same seam in reverse and shift along the edge', () => {
  for (const connectorStyle of ['rounded', 'angular']) {
    const game = givenPuzzle({ columns: 4, rows: 1, connectorStyle });
    const seams = Array.from({ length: 3 }, (_, column) => {
      const first = game.pieceAt(column, 0);
      const second = game.pieceAt(column + 1, 0);
      const inside = ({ y }) => y > 0 && y < game.board.cellSize.height;
      const seam = sharedPoints(first, second).filter(inside);
      assert.ok(seam.length > 2);
      assert.deepEqual(seam, sharedPoints(second, first).filter(inside).reverse());
      return seam;
    });
    assert.notEqual(seams[0].length, seams[1].length, 'Two seams should use different profiles');
    assert.equal(seams[0].length, seams[2].length);
    assert.notEqual(seams[0][0].y, seams[2][0].y, 'The same profile should appear at different offsets');
  }
});

test('connector-free pieces follow the cell borders and still snap to their targets', () => {
  const game = givenPuzzle({ connectorStyle: 'none' });
  for (const [index, { outline }] of game.puzzle.pieces.entries()) {
    assert.equal(outline.points.length, 4);
    assert.deepEqual(outline.frame, game.board.cells[index].bounds);
  }
  assert.equal(game.whenPiece(0, 0).dropsOn(1, 0), 'missed');
  assert.equal(game.whenPiece(0, 0).dropsOn(0, 0), 'placed');
});
