export type Point = Readonly<{ x: number; y: number }>;
export type Size = Readonly<{ width: number; height: number }>;

export function isQuarterTurns(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
}

export class Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;

  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  static around(points: readonly Point[]): Bounds {
    const xCoordinates = points.map(({ x }) => x);
    const yCoordinates = points.map(({ y }) => y);
    const left = Math.min(...xCoordinates);
    const top = Math.min(...yCoordinates);
    const right = Math.max(...xCoordinates);
    const bottom = Math.max(...yCoordinates);
    return new Bounds(left, top, right - left, bottom - top);
  }

  get center(): Point {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }

  toLocal(point: Point): Point {
    return { x: point.x - this.x, y: point.y - this.y };
  }
}
