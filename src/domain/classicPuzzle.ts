import { Board } from './Board.ts';
import { Puzzle } from './Puzzle.ts';

// TODO: Introduce selectable board and cut rules when the game has more than one layout.
export const classicBoard = new Board({ width: 512, height: 288 }, 4, 2);

export function newClassicPuzzle(): Puzzle {
  return new Puzzle(classicBoard, 28);
}
