export type Point = Readonly<{ x: number; y: number }>;
export type Size = Readonly<{ width: number; height: number }>;

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
    const xs = points.map(({ x }) => x);
    const ys = points.map(({ y }) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return new Bounds(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
  }

  get center(): Point {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }

  toLocal(point: Point): Point {
    return { x: point.x - this.x, y: point.y - this.y };
  }
}
