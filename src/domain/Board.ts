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
  readonly cells: readonly Cell[];

  constructor(size: Size, columns: number, rows: number) {
    if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
      throw new RangeError('A board needs whole, positive rows and columns');
    }
    if (!Number.isFinite(size.width) || size.width <= 0 || !Number.isFinite(size.height) || size.height <= 0) {
      throw new RangeError('A board needs positive, finite dimensions');
    }
    this.size = { width: size.width, height: size.height };
    this.columns = columns;
    this.rows = rows;
    const width = size.width / columns;
    const height = size.height / rows;
    this.cellSize = { width, height };
    this.cells = Array.from({ length: columns * rows }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return { column, row, bounds: new Bounds(column * width, row * height, width, height) };
    });
  }
}
