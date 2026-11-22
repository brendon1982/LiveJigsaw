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
