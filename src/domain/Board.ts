import { Bounds, type Size } from './geometry.ts';

export type Cell = Readonly<{
  row: number;
  column: number;
  bounds: Bounds;
}>;

export class Board {
  readonly size: Size;
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: Size;
  /** Cells run left to right within each row, starting with the top row. */
  readonly cells: readonly Cell[];

  constructor(size: Size, columns: number, rows: number) {
    validateGridDimensions(columns, rows);
    validateBoardSize(size);

    this.size = { width: size.width, height: size.height };
    this.columns = columns;
    this.rows = rows;
    this.cellSize = {
      width: size.width / columns,
      height: size.height / rows,
    };
    this.cells = buildCells(columns, rows, this.cellSize);
  }
}

function validateGridDimensions(columns: number, rows: number) {
  const validColumns = Number.isInteger(columns) && columns > 0;
  const validRows = Number.isInteger(rows) && rows > 0;
  if (!validColumns || !validRows) {
    throw new RangeError('A board needs whole, positive rows and columns');
  }
}

function validateBoardSize({ width, height }: Size) {
  const validWidth = Number.isFinite(width) && width > 0;
  const validHeight = Number.isFinite(height) && height > 0;
  if (!validWidth || !validHeight) {
    throw new RangeError('A board needs positive, finite dimensions');
  }
}

function buildCells(columns: number, rows: number, cellSize: Size): Cell[] {
  const { width: cellWidth, height: cellHeight } = cellSize;
  const cells = new Array<Cell>(columns * rows);
  let cellIndex = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * cellWidth;
      const y = row * cellHeight;
      const bounds = new Bounds(x, y, cellWidth, cellHeight);
      cells[cellIndex] = { column, row, bounds };
      cellIndex += 1;
    }
  }

  return cells;
}
