import type { Size } from '../../domain/geometry.ts';
import { seededRandom } from '../../domain/seededRandom.ts';
import { findRoute } from '../procgen/findRoute.ts';
import { planWalk, type VillagePoint, type Villager } from './villageWalks.ts';

export const cellSize = 32;
export const bladePadding = 2;
const districtColumns = 16;
const districtRows = 9;

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

type Terrain = 'meadow' | 'broadleaf' | 'pine';
type Random = ReturnType<typeof seededRandom>;
type Building = { frames: readonly number[]; scale: number };
type Bounds = { left: number; right: number; top: number; bottom: number };
type Lot = { entrance: number; position: VillagePoint; cells: number[] };
type RoadNetwork = Map<number, number>;
type BladeReach = { hub: number; radius: number };

const houseFrames = [9, 16, 17, 18, 19, 20, 21];

function villageGrid(columns: number, rows: number) {
  const cellId = ({ column, row }: Cell) => row * columns + column;
  const cellAt = (id: number): Cell => ({ column: id % columns, row: Math.floor(id / columns) });
  const inside = ({ column, row }: Cell) => column >= 0 && column < columns && row >= 0 && row < rows;
  const roadInterior = ({ column, row }: Cell) => column > 0 && column < columns - 1 && row > 0 && row < rows - 1;
  const neighbors = (cell: Cell) => directions.map((direction) => offset(cell, direction)).filter(inside);
  const outwardHeading = (cell: Cell) => directions.findIndex((direction) => !inside(offset(cell, direction)));
  const cells = Array.from({ length: columns * rows }, (_, id) => cellAt(id));
  const fieldPlots = cells.filter(({ column, row }) => column < columns - 1 && row < rows - 1)
    .map((cell) => {
      const id = cellId(cell);
      return [id, id + 1, id + columns, id + columns + 1];
    });
  return { columns, rows, cellId, cellAt, inside, roadInterior, neighbors, outwardHeading, cells, fieldPlots };
}

type VillageGrid = ReturnType<typeof villageGrid>;

function offset(cell: Cell, delta: Cell): Cell {
  return { column: cell.column + delta.column, row: cell.row + delta.row };
}

function between(random: Random, min: number, max: number) {
  return min + Math.floor(random() * (max - min + 1));
}

function choose<T>(random: Random, options: readonly T[]) {
  return options[between(random, 0, options.length - 1)];
}

function generateTerrain({ cells }: VillageGrid, random: Random): Terrain[] {
  const main = choose(random, cells);
  const grove = choose(random, cells.filter((cell) => distance(main, cell) >= 7));
  const mainType = random() < 0.5 ? 'broadleaf' : 'pine';
  const woods = [
    { center: main, width: 4.8 + random() * 3, height: 3 + random() * 2, type: mainType },
    { center: grove, width: 2.3 + random() * 2, height: 1.8 + random() * 1.6,
      type: mainType === 'pine' ? 'broadleaf' : 'pine' },
  ] as const;
  return cells.map((cell) => {
    const edge = 0.8 + random() * 0.4;
    for (const { center, width, height, type } of woods) {
      const x = (cell.column - center.column) / width;
      const y = (cell.row - center.row) / height;
      if (x * x + y * y < edge) return type;
    }
    return 'meadow';
  });
}

function buildRoads(grid: VillageGrid, start: Cell, end: Cell, terrain: Terrain[], roadCosts: number[], random: Random): RoadNetwork {
  const { cells, cellId, columns, roadInterior, outwardHeading } = grid;
  const roads: RoadNetwork = new Map();
  const connect = (path: Cell[]) => {
    for (let index = 1; index < path.length; index += 1) {
      const from = cellId(path[index - 1]);
      const to = cellId(path[index]);
      const heading = directions.findIndex(({ column, row }) => to - from === column + row * columns);
      const reverseHeading = (heading + 2) % directions.length;
      roads.set(from, (roads.get(from) ?? 0) | (1 << heading));
      roads.set(to, (roads.get(to) ?? 0) | (1 << reverseHeading));
    }
  };
  const main = routeRoad(grid, start, end, roadCosts)!;
  connect(main);
  for (const cell of [start, end]) {
    const id = cellId(cell);
    roads.set(id, roads.get(id)! | (1 << outwardHeading(cell)));
  }

  if (random() < 0.72) {
    const roots = main.slice(3, -3);
    const root = choose(random, roots);
    const spurSites = cells.filter((cell, id) => {
      const length = distance(root, cell);
      return length >= 2 && length <= 4 && roadInterior(cell) && !roads.has(id) && terrain[id] === 'meadow';
    });
    if (spurSites.length) {
      const spur = routeRoad(grid, root, choose(random, spurSites), roadCosts, roads);
      if (spur && spur.length <= 6) connect(spur);
    }
  }
  return roads;
}

function cellsUnder({ columns, rows, cellId }: VillageGrid, { left, right, top, bottom }: Bounds) {
  if (left < 0 || top < 0 || right > columns * cellSize || bottom > rows * cellSize) return;
  const result: number[] = [];
  for (let row = Math.floor(top / cellSize); row < Math.ceil(bottom / cellSize); row += 1) {
    for (let column = Math.floor(left / cellSize); column < Math.ceil(right / cellSize); column += 1) {
      result.push(cellId({ column, row }));
    }
  }
  return result;
}

function buildingReach(building: Building, structureSize: (frame: number) => Size, blades?: BladeReach) {
  const sizes = building.frames.map(structureSize);
  const halfWidth = Math.max(...sizes.map(({ width }) => width)) * building.scale / 2;
  const height = sizes.reduce((sum, size) => sum + size.height, 0) * building.scale;
  return {
    side: Math.max(halfWidth, blades?.radius ?? 0),
    above: Math.max(height, blades ? blades.hub + blades.radius : 0),
    below: Math.max(0, blades ? blades.radius - blades.hub : 0),
  };
}

function lotBoundary({ neighbors, cellAt, cellId }: VillageGrid, lot: Lot) {
  return new Set(lot.cells.flatMap((id) => neighbors(cellAt(id)).map(cellId)));
}

function developVillage(grid: VillageGrid, roads: RoadNetwork, terrain: Terrain[], structureSize: (frame: number) => Size, random: Random) {
  const { inside, cellAt, cellId, fieldPlots, neighbors } = grid;
  const developed = new Set<number>();
  const fields = new Set<number>();
  const props: Prop[] = [];
  const free = (id: number) => !roads.has(id) && !developed.has(id);
  const clearingCost = (ids: number[]) => ids.filter((id) => terrain[id] !== 'meadow').length;

  function lots(building: Building, blades?: BladeReach): Lot[] {
    const { side, above, below } = buildingReach(building, structureSize, blades);
    const result: Lot[] = [];
    for (const [entrance] of roads) {
      const frontage = cellAt(entrance);
      for (const direction of directions) {
        const cell = offset(frontage, direction);
        if (!inside(cell) || !free(cellId(cell))) continue;
        const position = point(cell, 0.5, 0.9);
        if (direction.row === 1) position.y = Math.max(position.y, cell.row * cellSize + above + 2);
        if (direction.column === 1) position.x = Math.max(position.x, cell.column * cellSize + side + 2);
        if (direction.column === -1) position.x = Math.min(position.x, (cell.column + 1) * cellSize - side - 2);
        const footprint = cellsUnder(grid, {
          left: position.x - side, right: position.x + side,
          top: position.y - above, bottom: position.y + below,
        });
        if (footprint?.every(free)) result.push({ entrance, position, cells: footprint });
      }
    }
    return result;
  }

  function build(lot: Lot, { frames, scale }: Building) {
    for (const id of lot.cells) developed.add(id);
    props.push({ ...lot.position, kind: 'Structure', frames, scale });
  }

  function best<T>(candidates: T[], score: (candidate: T) => number): T | undefined {
    let winner: T | undefined;
    let highest = -Infinity;
    for (const candidate of candidates) {
      const value = score(candidate);
      if (value > highest) {
        winner = candidate;
        highest = value;
      }
    }
    return winner;
  }

  const blades = between(random, 13, 15);
  const bladeScale = blades === 13 ? 0.51 : 0.45;
  const { width, height } = structureSize(blades);
  const radius = Math.hypot(width + 2 * bladePadding, height + 2 * bladePadding) * bladeScale / 2;
  const tallMill = { frames: [11, 10], scale: 0.4, hub: 41 };
  const shortMill = { frames: [17], scale: 0.45, hub: 33 };
  const millOptions = random() < 0.5 ? [tallMill, shortMill] : [shortMill, tallMill];
  const availableFields = fieldPlots.filter((plot) => plot.every(free));
  const farmSites = millOptions.flatMap((building, preference) =>
    lots(building, { hub: building.hub, radius }).flatMap((lot) => {
      const boundary = lotBoundary(grid, lot);
      return availableFields
        .filter((plot) => plot.some((id) => boundary.has(id)) && plot.every((id) => !lot.cells.includes(id)))
        .map((plot) => ({ building, lot, plot, preference }));
    }));
  const farm = best(farmSites, ({ lot, plot, preference }) =>
    random() * 3 - clearingCost(lot.cells) * 0.65 - clearingCost(plot) * 1.2 - preference * 1.4);
  if (!farm) return;
  build(farm.lot, farm.building);
  for (const id of farm.plot) {
    fields.add(id);
    developed.add(id);
  }
  const mill = { ...farm.lot.position, hub: farm.building.hub, blades, bladeScale };

  const stall = { frames: choose(random, [[22], [7, 3]]), scale: 0.3 };
  const marketSites = lots(stall).filter((lot) => lot.entrance !== farm.lot.entrance).flatMap((lot) => {
    const boundary = lotBoundary(grid, lot);
    return [...boundary]
      .filter((yard) => free(yard) && !lot.cells.includes(yard)
        && neighbors(cellAt(yard)).some((cell) => roads.has(cellId(cell))))
      .map((yard) => ({ lot, yard }));
  });
  const townSquare = best(marketSites, ({ lot, yard }) => {
    const entrance = cellAt(lot.entrance);
    const exits = roads.get(lot.entrance)!;
    const branching = directions.filter((_, heading) => exits & (1 << heading)).length >= 3;
    return (branching ? 3 : 0) + Math.min(6, distance(entrance, cellAt(farm.lot.entrance))) * 0.5
      - clearingCost([...lot.cells, yard]) + random() * 2;
  });
  if (!townSquare) return;
  build(townSquare.lot, stall);
  developed.add(townSquare.yard);
  const market = cellAt(townSquare.lot.entrance);
  const destinations = new Set([farm.lot.entrance, townSquare.lot.entrance]);
  const houses = Array.from({ length: between(random, 4, 7) }, () => ({
    frames: [choose(random, houseFrames)], scale: 0.35,
  }));
  const buildings = [{ frames: [4, 23], scale: 0.38 }, { frames: [6, 2], scale: 0.4 }, ...houses];
  const clustering = 0.12 + random() * 0.4;
  for (const building of buildings) {
    const lot = best(lots(building), (candidate) => random() * 3
      - clearingCost(candidate.cells) * 0.7 - distance(cellAt(candidate.entrance), market) * clustering);
    if (!lot) continue;
    build(lot, building);
    destinations.add(lot.entrance);
  }
  if (destinations.size < 3 || props.length < 6) return;
  return { developed, fields, props, mill, destinations: [...destinations] };
}

function paintVillage(grid: VillageGrid, terrain: Terrain[], roads: RoadNetwork, development: NonNullable<ReturnType<typeof developVillage>>, random: Random) {
  const { cells, inside, neighbors, cellId } = grid;
  const { developed, fields, props } = development;
  const woodland = terrain.map((type, id) => roads.has(id) || developed.has(id) ? 'meadow' : type);
  const cropOffset = between(random, 0, 1);
  const scatter = (cell: Cell, frame: number, scale: number) => {
    props.push({ ...point(cell, 0.44 + random() * 0.12, 0.84 + random() * 0.1),
      kind: 'Environment', frames: [frame], scale });
  };

  return cells.map((cell, id): GroundTile => {
    const grass = between(random, 57, 58);
    const connections = roads.get(id);
    if (connections) {
      const frame = roadFrames[connections];
      const [x, y] = roadOffsets[frame];
      return random() < 0.5 ? { frame } : { frame: grass, road: { frame: frame + 5, x, y } };
    }
    if (fields.has(id)) return { frame: 55 + (cell.column + cropOffset) % 2 };
    if (developed.has(id)) return { frame: grass };

    const type = woodland[id];
    if (type !== 'meadow') {
      const pine = type === 'pine';
      const neighbors = directions.map((direction) => offset(cell, direction))
        .filter((neighbor) => !inside(neighbor) || woodland[cellId(neighbor)] === type).length;
      if (neighbors < 3) {
        scatter(cell, choose(random, pine ? [2, 3] : [1, 21]), 0.27 + random() * 0.03);
        return { frame: grass };
      }
      const first = pine ? (neighbors === 4 ? 47 : 45) : (neighbors === 4 ? 43 : 41);
      return { frame: between(random, first, first + 1) };
    }
    const roadside = neighbors(cell).some((neighbor) => roads.has(cellId(neighbor)));
    if (random() < (roadside ? 0.27 : 0.035)) {
      scatter(cell, choose(random, furnishings), 0.24 + random() * 0.04);
    }
    return { frame: grass };
  });
}

function districtApproaches({ cells, columns, rows }: VillageGrid) {
  return cells.filter(({ column, row }) =>
    (column === 0 || column === columns - 1) !== (row === 0 || row === rows - 1));
}

function generateDistrict(
  grid: VillageGrid, crossings: Cell[], approaches: Cell[], structureSize: (frame: number) => Size, random: Random,
) {

  // Keep district crossings fixed while retrying terrain and local roads.
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const start = crossings[0] ?? choose(random, approaches);
    const end = crossings[1] ?? choose(random, approaches.filter((cell) =>
      distance(start, cell) >= 11 && grid.outwardHeading(start) !== grid.outwardHeading(cell)));
    const terrain = generateTerrain(grid, random);
    const roadCosts = terrain.map((type) => (type === 'meadow' ? 1 : 2.8) + random() * 0.45);
    const roads = buildRoads(grid, start, end, terrain, roadCosts, random);
    const development = developVillage(grid, roads, terrain, structureSize, random);
    if (!development) continue;

    const ground = paintVillage(grid, terrain, roads, development, random);
    const { props, mill, destinations } = development;
    const walks = planVillageWalks(grid, destinations, roads, random);
    return { ground, props, mill, walks };
  }
  throw new Error('No village road leaves enough room for a settlement');
}

function districtEdges(cells: number, minimum: number) {
  const districts = Math.floor(cells / minimum);
  return Array.from({ length: districts + 1 }, (_, index) => Math.round(index * cells / districts));
}

function villageDistricts(columns: number, rows: number, random: Random) {
  const columnEdges = districtEdges(columns, districtColumns);
  const rowEdges = districtEdges(rows, districtRows);
  const districts = [];
  for (let row = 0; row < rowEdges.length - 1; row += 1) {
    for (let index = 0; index < columnEdges.length - 1; index += 1) {
      // Reverse every other row so the road can turn into the next row of districts.
      const column = row % 2 === 0 ? index : columnEdges.length - 2 - index;
      districts.push({
        column: columnEdges[column], row: rowEdges[row],
        columns: columnEdges[column + 1] - columnEdges[column],
        rows: rowEdges[row + 1] - rowEdges[row],
        crossings: [] as Cell[],
      });
    }
  }
  for (let index = 1; index < districts.length; index += 1) {
    const before = districts[index - 1];
    const after = districts[index];
    if (before.row === after.row) {
      const row = Math.floor(before.rows / 2) + between(random, -1, 1);
      const east = before.column < after.column;
      before.crossings.push({ column: east ? before.columns - 1 : 0, row });
      after.crossings.push({ column: east ? 0 : after.columns - 1, row });
    } else {
      const column = Math.floor(before.columns / 2) + between(random, -1, 1);
      before.crossings.push({ column, row: before.rows - 1 });
      after.crossings.push({ column, row: 0 });
    }
  }
  return districts;
}

export function generateVillage(viewport: Size, seed: number, structureSize: (frame: number) => Size) {
  const random = seededRandom(seed);
  const columns = Math.max(districtColumns, Math.ceil(viewport.width / cellSize));
  const rows = Math.max(districtRows, Math.ceil(viewport.height / cellSize));
  const origin = {
    x: Math.min(0, Math.floor((viewport.width - districtColumns * cellSize) / 2)),
    y: Math.min(0, Math.floor((viewport.height - districtRows * cellSize) / 2)),
  };
  const ground = new Array<GroundTile>(columns * rows);
  const props: Prop[] = [];
  const mills: ReturnType<typeof generateDistrict>['mill'][] = [];
  const walks: ReturnType<typeof planWalk>[] = [];

  for (const district of villageDistricts(columns, rows, random)) {
    const grid = villageGrid(district.columns, district.rows);
    const approaches = districtApproaches(grid).filter(({ column, row }) => {
      const x = district.column + column;
      const y = district.row + row;
      return x === 0 || x === columns - 1 || y === 0 || y === rows - 1;
    });
    const layout = generateDistrict(grid, district.crossings, approaches, structureSize, random);
    const villageId = (id: number) => {
      const { column, row } = grid.cellAt(id);
      return (district.row + row) * columns + district.column + column;
    };
    const left = origin.x + district.column * cellSize;
    const top = origin.y + district.row * cellSize;
    const translate = ({ x, y }: VillagePoint) => ({ x: left + x, y: top + y });
    layout.ground.forEach((tile, id) => { ground[villageId(id)] = tile; });
    for (const prop of layout.props) props.push({ ...prop, ...translate(prop) });
    mills.push({ ...layout.mill, ...translate(layout.mill) });
    for (const walk of layout.walks) walks.push({
      ...walk,
      stops: walk.stops.map(villageId),
      steps: walk.steps.map((step) => ({ ...step, from: translate(step.from), to: translate(step.to) })),
    });
  }
  return { columns, origin, ground, props, mills, walks };
}

function planVillageWalks(grid: VillageGrid, destinations: number[], roads: RoadNetwork, random: Random) {
  const count = between(random, 5, 7);
  return Array.from({ length: count }, (_, index) => {
    const firstStop = destinations[index % destinations.length];
    const otherStops = destinations.filter((id) => id !== firstStop);
    const secondIndex = between(random, 0, otherStops.length - 1);
    const [secondStop] = otherStops.splice(secondIndex, 1);
    const [front, back] = choose(random, villagers);
    const villager: Villager = {
      front,
      back,
      stops: [firstStop, secondStop, choose(random, otherStops)],
      phase: random(),
      lane: 1.4 + random() * 1.4,
      speed: between(random, 12, 22) / 1000,
    };
    return planWalk(villager, (from, to) => followRoad(grid, from, to, roads), () => between(random, 550, 1650));
  });
}

function followRoad({ cellAt, cellId, inside }: VillageGrid, from: number, to: number, roads: RoadNetwork): VillagePoint[] {
  const queue = [from];
  const previous = new Map<number, number>([[from, from]]);
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (id === to) {
      const path = [];
      for (let step = to; step !== from; step = previous.get(step)!) path.push(step);
      path.push(from);
      return path.reverse().map((step) => point(cellAt(step)));
    }
    const connections = roads.get(id)!;
    directions.forEach(({ column, row }, heading) => {
      if (!(connections & (1 << heading))) return;
      const neighbor = offset(cellAt(id), { column, row });
      if (!inside(neighbor)) return;
      const next = cellId(neighbor);
      if (previous.has(next)) return;
      previous.set(next, id);
      queue.push(next);
    });
  }
  throw new Error('Village destinations must be on the same road network');
}

function routeRoad({ cellAt, cellId, roadInterior }: VillageGrid, from: Cell, to: Cell, costs: number[], blocked?: RoadNetwork): Cell[] | undefined {
  const path = findRoute(cellId(from), cellId(to), (current) =>
    directions.flatMap((direction, heading) => {
      const cell = offset(cellAt(current), direction);
      if (!roadInterior(cell) && (cell.column !== to.column || cell.row !== to.row)) return [];
      const id = cellId(cell);
      return blocked?.has(id) ? [] : [{ id, heading, cost: costs[id] }];
    }), (id, target) => distance(cellAt(id), cellAt(target)), 0.6);
  return path?.map(cellAt);
}
