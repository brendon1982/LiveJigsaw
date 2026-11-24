import type { Size } from '../../domain/geometry.ts';
import { seededRandom } from '../../domain/seededRandom.ts';
import { planWalk, type VillagePoint, type Villager } from './villageWalks.ts';

export const cellSize = 32;
const columns = 16;
const rows = 9;
export const villageSize = { width: columns * cellSize, height: rows * cellSize };

type Cell = { column: number; row: number };
type Prop = VillagePoint & {
  kind: 'Structure' | 'Environment';
  frames: readonly number[];
  scale: number;
};
type RoadOverlay = { frame: number; x: number; y: number };
type GroundTile = { frame: number; road?: RoadOverlay };

const directions = [
  { column: 0, row: -1 },
  { column: 1, row: 0 },
  { column: 0, row: 1 },
  { column: -1, row: 0 },
];
const cellId = ({ column, row }: Cell) => row * columns + column;
const roadInterior = ({ column, row }: Cell) => column > 0 && column < columns - 1 && row > 0 && row < rows - 1;
const distance = (a: Cell, b: Cell) => Math.abs(a.column - b.column) + Math.abs(a.row - b.row);
const point = ({ column, row }: Cell, dx = 0.5, dy = 0.5): VillagePoint => ({
  x: (column + dx) * cellSize,
  y: (row + dy) * cellSize,
});

// Connections are encoded in north, east, south, west bit order.
const roadFrames = [0, 34, 33, 31, 35, 3, 17, 21, 19, 32, 4, 7, 18, 20, 6, 5];
// Transparent versions of the roads reuse the same shape. Offsets are in atlas pixels.
const roadOffsets: Record<number, readonly [number, number]> = {
  3: [34, 0], 4: [0, 34], 5: [0, 0], 6: [0, 34], 7: [0, 0],
  17: [34, 42], 18: [0, 34], 19: [0, 28], 20: [0, 0], 21: [33, 0],
  31: [42, 0], 32: [0, 0], 33: [28, 28], 34: [28, 0], 35: [28, 28],
};

const furnishings = Array.from({ length: 17 }, (_, index) => index + 4);
const villagers = [
  [24, 1], [6, 7], [12, 13], [18, 19],
  [2, 2], [3, 3], [4, 4], [5, 5],
  [8, 8], [9, 9], [10, 10], [11, 11],
  [14, 14], [15, 15], [16, 16], [17, 17],
  [20, 20], [21, 21], [22, 22], [23, 23],
] as const;

export function generateVillage(seed: number, structureSize: (frame: number) => Size) {
  const random = seededRandom(seed);
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const choose = <T>(options: readonly T[]) => options[between(0, options.length - 1)];
  const mirrored = random() < 0.5;
  const place = (column: number, row: number): Cell => ({ column: mirrored ? columns - 1 - column : column, row });
  const farm = place(between(2, 4), between(2, 4));
  const plaza = place(between(7, 8), between(4, 5));
  const gate = place(between(12, 13), between(3, 4));
  const market = place(between(9, 11), 7);
  const occupied = new Set<number>();
  const props: Prop[] = [];
  const reserve = (entrance: Cell, firstColumn: number, lastColumn: number, firstRow: number, lastRow: number) => {
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        occupied.add(cellId({ column: entrance.column + column, row: entrance.row + row }));
      }
    }
  };
  reserve(farm, -2, 2, -2, -1);
  reserve(plaza, -1, 1, -2, -1);
  reserve(gate, -1, 1, -2, -1);
  reserve(market, -1, 1, 1, 1);

  const roads = new Map<number, number>();
  const connect = (from: Cell, to: Cell) => {
    const path = routeRoad(from, to, occupied, roads);
    path.slice(1).forEach((cell, index) => {
      const previous = path[index];
      const heading = directions.findIndex(({ column, row }) =>
        previous.column + column === cell.column && previous.row + row === cell.row);
      const fromId = cellId(previous);
      const toId = cellId(cell);
      roads.set(fromId, (roads.get(fromId) ?? 0) | (1 << heading));
      roads.set(toId, (roads.get(toId) ?? 0) | (1 << ((heading + 2) % directions.length)));
    });
  };
  const mainRoad = (entrance: Cell, firstColumn: number, lastColumn: number) => {
    // A waypoint gives each approach a different bend while leaving a clear route around buildings.
    const waypoint = place(between(firstColumn, lastColumn), between(4, 6));
    if (occupied.has(cellId(waypoint))) {
      connect(entrance, plaza);
      return;
    }
    connect(entrance, waypoint);
    connect(waypoint, plaza);
  };
  mainRoad(farm, 5, 6);
  mainRoad(gate, 10, 11);
  connect(market, plaza);

  if (random() < 0.5) {
    const crossroads = [];
    for (const [id, exits] of roads) {
      if (exits !== 0b0101 && exits !== 0b1010) continue;
      const center = { column: id % columns, row: Math.floor(id / columns) };
      const turnoffs = directions
        .filter((_, heading) => !(exits & (1 << heading)))
        .map(({ column, row }) => ({ column: center.column + column, row: center.row + row }));
      if (turnoffs.every((cell) => roadInterior(cell) && !occupied.has(cellId(cell)) && !roads.has(cellId(cell)))) {
        crossroads.push({ center, turnoffs });
      }
    }
    if (crossroads.length) {
      const { center, turnoffs } = choose(crossroads);
      for (const turnoff of turnoffs) connect(center, turnoff);
    }
  }

  const tallMill = farm.row > 2 && random() < 0.55;
  const mill = { ...point(farm, 0.5, 0.10), hub: tallMill ? 41 : 33, blades: between(13, 15) };
  const building = (position: VillagePoint, frames: number[], scale: number) => {
    props.push({ ...position, kind: 'Structure', frames, scale });
    // The road reserves leave room for entrances. Scenery also needs to clear any art that overhangs those cells.
    let bottom = position.y;
    for (const frame of frames) {
      const { width, height } = structureSize(frame);
      const halfWidth = width * scale / 2;
      const top = bottom - height * scale;
      const firstColumn = Math.max(0, Math.floor((position.x - halfWidth) / cellSize));
      const lastColumn = Math.min(columns, Math.ceil((position.x + halfWidth) / cellSize));
      const firstRow = Math.max(0, Math.floor(top / cellSize));
      const lastRow = Math.min(rows, Math.ceil(bottom / cellSize));
      for (let row = firstRow; row < lastRow; row += 1) {
        for (let column = firstColumn; column < lastColumn; column += 1) {
          occupied.add(cellId({ column, row }));
        }
      }
      bottom = top;
    }
  };
  const house = () => choose([[9], [16], [17], [18], [19], [20], [21]]);
  building(mill, tallMill ? [11, 10] : [17], tallMill ? 0.40 : 0.45);
  building(point(plaza, -0.60, 0.05), house(), 0.35);
  building(point(plaza, 0.50, -0.65), [4, 23], 0.38);
  building(point(plaza, 1.60, 0.07), house(), 0.35);
  building(point(gate, 0.5, 0.15), [6, 2], 0.43);
  building(point(gate, 1.68, -0.24), [5, 1], 0.33);
  if (random() < 0.55) building(point(gate, -0.65, -0.27), [8], 0.31);
  if (random() < 0.65) building(point(plaza, 1.24, -1.08), [12], 0.27);
  building(point(market, 0.5, 1.73), choose([[22], [7, 3]]), 0.28);
  building(point(market, 1.48, 1.44), house(), 0.32);

  const ground: GroundTile[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const id = cellId({ column, row });
      const connections = roads.get(id);
      const grass = between(57, 58);
      if (!connections) {
        ground.push({ frame: grass });
        continue;
      }
      occupied.add(id);
      const road = roadFrames[connections];
      const [x, y] = roadOffsets[road];
      ground.push(random() < 0.5 ? { frame: road } : { frame: grass, road: { frame: road + 5, x, y } });
    }
  }
  for (const column of [farm.column - 1, farm.column + 1]) {
    ground[cellId({ column, row: farm.row - 1 })] = { frame: between(53, 56) };
    ground[cellId({ column, row: farm.row - 2 })] = { frame: between(53, 56) };
  }

  const claim = (cell: Cell) => {
    if (cell.column < 0 || cell.column >= columns || cell.row < 0 || cell.row >= rows) return false;
    const id = cellId(cell);
    if (occupied.has(id)) return false;
    occupied.add(id);
    return true;
  };
  const scatter = (cell: Cell, frame: number, scale: number) => {
    if (!claim(cell)) return;
    const dx = 0.28 + random() * 0.44;
    const dy = 0.58 + random() * 0.25;
    props.push({ ...point(cell, dx, dy), kind: 'Environment', frames: [frame], scale });
  };

  const groves = [
    place(between(0, 1), between(4, 5)),
    place(between(3, 5), between(6, 8)),
    place(between(6, 9), between(0, 1)),
    place(between(13, 15), between(5, 7)),
  ];
  for (const [index, center] of groves.entries()) {
    const pine = index % 2 === 0;
    for (let row = -1; row <= 1; row += 1) {
      for (let column = -2; column <= 2; column += 1) {
        const cell = { column: center.column + column, row: center.row + row };
        const core = Math.abs(column) <= 1;
        if (core && random() < 0.85) {
          if (claim(cell)) ground[cellId(cell)] = { frame: pine ? between(47, 48) : between(43, 44) };
        } else if (random() < 0.55) {
          if (claim(cell)) ground[cellId(cell)] = { frame: pine ? between(45, 46) : between(41, 42) };
        } else if (random() < 0.65) {
          scatter(cell, choose(pine ? [2, 3] : [1, 21]), 0.29 + random() * 0.08);
        }
      }
    }
    const clearing = { column: center.column + choose([-2, 2]), row: center.row + choose([-2, 2]) };
    if (random() < 0.72 && claim(clearing)) {
      ground[cellId(clearing)] = { frame: between(49, 52) };
    }
  }
  const detailCount = between(15, 22);
  for (let attempt = 0; attempt < detailCount; attempt += 1) {
    scatter(place(between(0, columns - 1), between(0, rows - 1)), choose(furnishings), 0.24 + random() * 0.09);
  }

  const destinations = [farm, plaza, gate, market].map(cellId);
  const walks = Array.from({ length: between(5, 7) }, (_, index) => {
    const start = destinations[index % destinations.length];
    const remaining = destinations.filter((id) => id !== start);
    const second = remaining.splice(between(0, remaining.length - 1), 1)[0];
    const [front, back] = choose(villagers);
    const villager: Villager = {
      front,
      back,
      stops: [start, second, choose(remaining)],
      phase: random(),
      lane: 1.4 + random() * 1.4,
      speed: between(12, 22) / 1000,
    };
    return planWalk(villager, (from, to) => followRoad(from, to, roads), () => between(550, 1650));
  });
  return { ground, props, mill, walks };
}

function followRoad(from: number, to: number, roads: Map<number, number>): VillagePoint[] {
  const queue = [from];
  const previous = new Map<number, number>([[from, from]]);
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (id === to) {
      const path = [];
      for (let step = to; step !== from; step = previous.get(step)!) path.push(step);
      path.push(from);
      return path.reverse().map((step) => point({ column: step % columns, row: Math.floor(step / columns) }));
    }
    const connections = roads.get(id)!;
    directions.forEach(({ column, row }, heading) => {
      const next = id + column + row * columns;
      if (!(connections & (1 << heading)) || previous.has(next)) return;
      previous.set(next, id);
      queue.push(next);
    });
  }
  throw new Error('Village destinations must be on the same road network');
}

function routeRoad(from: Cell, to: Cell, occupied: Set<number>, roads: Map<number, number>): Cell[] {
  type Step = { cell: Cell; heading: number; cost: number; estimate: number; previous?: Step };
  const frontier: Step[] = [{ cell: from, heading: -1, cost: 0, estimate: distance(from, to) }];
  const best = new Map<number, number>();
  const target = cellId(to);

  while (frontier.length) {
    frontier.sort((a, b) => b.estimate - a.estimate);
    const step = frontier.pop()!;
    if (cellId(step.cell) === target) {
      const path: Cell[] = [];
      for (let current: Step | undefined = step; current; current = current.previous) path.push(current.cell);
      return path.reverse();
    }
    for (const [heading, offset] of directions.entries()) {
      const cell = { column: step.cell.column + offset.column, row: step.cell.row + offset.row };
      if (!roadInterior(cell)) continue;
      const id = cellId(cell);
      if (occupied.has(id)) continue;
      const currentRoad = roads.get(cellId(step.cell)) ?? 0;
      const followsRoad = currentRoad & (1 << heading);
      const turns = step.heading !== -1 && step.heading !== heading;
      const cost = step.cost + (followsRoad ? 0.65 : 1) + (turns ? 0.35 : 0);
      const state = id * directions.length + heading;
      if (cost >= (best.get(state) ?? Infinity)) continue;
      best.set(state, cost);
      frontier.push({ cell, heading, cost, estimate: cost + 0.65 * distance(cell, to), previous: step });
    }
  }
  throw new Error('The village landmarks must be reachable by road');
}
