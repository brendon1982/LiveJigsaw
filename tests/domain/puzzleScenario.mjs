import assert from 'node:assert/strict';
import { Board } from '../../src/domain/Board.ts';
import { Puzzle } from '../../src/domain/Puzzle.ts';

export function givenPuzzle({
  columns = 2,
  rows = 2,
  cell = { width: 128, height: 144 },
  snapTolerance = 10,
  connectorStyle,
} = {}) {
  const board = new Board({ width: columns * cell.width, height: rows * cell.height }, columns, rows);
  const puzzle = new Puzzle(board, snapTolerance, connectorStyle);

  function pieceAt(column, row) {
    return puzzle.pieces[row * columns + column];
  }

  return {
    board,
    puzzle,
    pieceAt,
    whenPiece(column, row) {
      const piece = pieceAt(column, row);
      return {
        dropsOn(targetColumn, targetRow) {
          return puzzle.drop(piece.id, pieceAt(targetColumn, targetRow).target);
        },
        dropsNearTarget({ x = 0, y = 0 } = {}) {
          return puzzle.drop(piece.id, { x: piece.target.x + x, y: piece.target.y + y });
        },
      };
    },
    expectProgress({ placed, total, complete = false }) {
      assert.equal(puzzle.placedCount, placed);
      assert.equal(puzzle.pieces.length, total);
      assert.equal(puzzle.isComplete, complete);
    },
  };
}
