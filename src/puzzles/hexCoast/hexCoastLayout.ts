import type { Size } from '../../domain/geometry.ts';
import { seededRandom } from '../../domain/seededRandom.ts';
import { findRoute } from '../procgen/findRoute.ts';

export const terraceHeight = 18;
export const shoreHeight = 12;

const districtSize = { width: 1024, height: 576 };
const hexWidth = 64;
const rowHeight = 48;
type Random = ReturnType<typeof seededRandom>;
type Biome = 'water' | 'sand' | 'grass' | 'autumn' | 'rock' | 'snow';
export type CoastTile = { id: number; x: number; y: number; level: number; biome: Biome; wooded: boolean };
type Building = { wall: string; upper: string; roof: string; floors: number };

function coastGrid(columns: number, rows: number) {
  const cells = Array.from({ length: columns * rows }, (_, id) => {
    const column = id % columns;
    const row = Math.floor(id / columns);
    return { id, column, row, x: column * hexWidth + (row % 2) * hexWidth / 2, y: row * rowHeight - 16 };
  });

  const neighbors = cells.map(({ column, row }) => {
    const left = column - 1 + row % 2;
    const right = left + 1;
    return [[column + 1, row], [right, row + 1], [left, row + 1],
      [column - 1, row], [left, row - 1], [right, row - 1]]
      .flatMap(([x, y], heading) => x >= 0 && x < columns && y >= 0 && y < rows
        ? [{ id: y * columns + x, heading }]
        : []);
  });

  const width = (columns - 1) * hexWidth;
  const height = (rows - 2) * rowHeight;
  function distance(from: number, to: number) {
    const start = cells[from];
    const end = cells[to];
    const rowDelta = start.row - end.row;
    // Remove the stagger from the grid columns to measure along the hex axes.
    const axialColumnDelta = start.column - Math.floor(start.row / 2) - end.column + Math.floor(end.row / 2);
    return Math.max(Math.abs(rowDelta), Math.abs(axialColumnDelta), Math.abs(rowDelta + axialColumnDelta));
  }

  const buildable = ({ level, x, y }: CoastTile) =>
    level === 1 && x >= 56 && x <= width - 56 && y >= 110 && y <= height - 53;
  return { cells, neighbors, width, height, distance, buildable };
}

type CoastGrid = ReturnType<typeof coastGrid>;

function elevation(shoreline: number, mountain: number) {
  if (shoreline < 0) return 0;
  if (shoreline < 0.25 || mountain < 0.14) return 1;
  if (mountain < 0.53) return 2;
  if (mountain < 0.83) return 3;
  return 4;
}

function tileBiome(level: number, shoreline: number, autumn: boolean): Biome {
  if (level === 0) return 'water';
  if (level === 4) return 'snow';
  if (level === 3) return 'rock';
  if (shoreline < 0.22) return 'sand';
  return autumn ? 'autumn' : 'grass';
}

function terrain({ cells, width, height }: CoastGrid, random: Random, separateIslands: boolean): CoastTile[] {
  const side = random() < 0.5 ? -1 : 1;
  const main = { x: width / 2 + side * (118 + random() * 62), y: height / 2 - 48 + random() * 80 };
  const island = { x: width / 2 - side * (width * 0.26 + random() * 45), y: height * (0.27 + random() * 0.42) };
  const coastWidth = width * (0.29 + random() * 0.09);
  const coastHeight = height * (0.31 + random() * 0.09);
  const islandWidth = 106 + random() * 68;
  const islandHeight = 78 + random() * 62;
  const capeX = main.x + side * (78 + random() * 88);
  const capeY = main.y + (random() < 0.5 ? -1 : 1) * (100 + random() * 78);
  const peakX = main.x + side * (45 + random() * 118);
  const peakY = main.y + (random() - 0.5) * 145;
  const ridgeWidth = 105 + random() * 70;
  const ridgeHeight = 70 + random() * 58;
  const forestPhase = random() * 10;
  const autumnPhase = random() * 10;
  const coastPhase = random() * 10;
  const hill = (x: number, y: number, width: number, height: number) => 1 - (x / width) ** 2 - (y / height) ** 2;
  return cells.map(({ id, x, y }) => {
    const coast = Math.max(
      hill(x - main.x, y - main.y, coastWidth, coastHeight),
      hill(x - capeX, y - capeY, 170, 108),
      hill(x - island.x, y - island.y, islandWidth, islandHeight),
    );
    const coastEdge = Math.min(x, width + hexWidth - x, y + 16, height + 80 - y);
    const shorelineNoise = Math.sin(x / 100 + y / 89 + coastPhase) * 0.15
      + Math.cos(x / 115 - y / 65 + coastPhase) * 0.13;
    const shoreline = separateIslands ? Math.min(coast + shorelineNoise, (coastEdge - 24) / 72) : coast + shorelineNoise;
    const mountain = hill(x - peakX, y - peakY, ridgeWidth, ridgeHeight) + Math.sin((x + y) / 63) * 0.12;
    const forest = Math.sin(x / 140 + y / 77 + forestPhase) + Math.cos(x / 118 - y / 115 + forestPhase);
    const autumn = Math.sin(x / 137 - y / 106 + autumnPhase) > 0.60;
    const level = elevation(shoreline, mountain);
    const biome = tileBiome(level, shoreline, autumn);
    const wooded = (biome === 'grass' || biome === 'autumn') && forest + random() * 0.28 > -0.12;
    return { id, x, y, level, biome, wooded };
  });
}

function develop(grid: CoastGrid, tiles: CoastTile[], random: Random) {
  const { neighbors, buildable, distance } = grid;
  const availableLots = (tile: CoastTile) => neighbors[tile.id].filter(({ id }) => buildable(tiles[id])).length;
  const sites = tiles.filter((tile) => buildable(tile) && availableLots(tile) >= 3);
  const harbors = sites.filter((tile) => neighbors[tile.id].some(({ id }) => tiles[id].level === 0))
    .map((tile) => ({ tile, score: availableLots(tile) + random() * 4 }));
  harbors.sort((a, b) => b.score - a.score);

  const travel = neighbors.map((adjacent) => adjacent.flatMap(({ id, heading }) => {
    const tile = tiles[id];
    return buildable(tile) ? [{ id, heading, cost: 1 + (tile.wooded ? 0.65 : 0) }] : [];
  }));
  for (const { tile: harbor } of harbors) {
    const destinations = sites.filter(({ id }) => distance(harbor.id, id) >= 4)
      .map((tile) => ({ tile, score: availableLots(tile) + Math.min(8, distance(harbor.id, tile.id)) + random() * 6 }));
    destinations.sort((a, b) => b.score - a.score);
    for (const { tile: village } of destinations) {
      const road = findRoute(harbor.id, village.id, (id) => travel[id], distance, 0.35);
      if (!road || road.length > 19) continue;
      const buildings = buildSettlements(grid, tiles, road, harbor, village, random);
      if (buildings) return { road, towns: [harbor.id, village.id], buildings };
    }
  }
}

function buildSettlements(
  { neighbors, buildable, distance }: CoastGrid,
  tiles: CoastTile[], road: number[], harbor: CoastTile, village: CoastTile, random: Random,
) {
  const occupied = new Set(road);
  const roadside = new Set(road.flatMap((id) => neighbors[id].map((neighbor) => neighbor.id)));
  const buildings = new Map<number, Building>();
  const plans = [
    { town: harbor, material: 'sand', roofs: ['redRoofRounded', 'sandRoofShort', 'redRoofShort'] },
    { town: village, material: 'stone', roofs: ['redRoofPointy', 'stoneRoofShort', 'woodRoofShort'] },
  ];
  for (const { town, material, roofs } of plans) {
    const lots = tiles.filter((tile) => buildable(tile) && roadside.has(tile.id) && !occupied.has(tile.id)
      && distance(tile.id, town.id) <= 3)
      .map((tile) => ({ tile, score: 4 - distance(tile.id, town.id) + (tile.wooded ? 0 : 1) + random() * 2 }));
    if (lots.length < 4) return;
    lots.sort((a, b) => b.score - a.score);
    const count = 4 + Math.floor(random() * 3);
    lots.slice(0, count).forEach(({ tile }, index) => {
      const walls = index > 0 && random() < 0.28 ? 'wood' : material;
      buildings.set(tile.id, {
        wall: `${walls}${random() < 0.5 ? 'DoorWindow' : 'DoorWindowMirror'}`,
        upper: `${walls}Windows`,
        roof: roofs[index % roofs.length],
        floors: index === 0 ? 2 : 1,
      });
      occupied.add(tile.id);
    });
  }
  return buildings;
}

function generateDistrict(grid: CoastGrid, random: Random, separateIslands: boolean) {
  // Keep the shore intact while testing road placements. Roll new terrain only if it cannot support both towns.
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const tiles = terrain(grid, random, separateIslands);
    const settlement = develop(grid, tiles, random);
    if (settlement) return { tiles, ...settlement };
  }
  throw new Error('The coast could not find room for both settlements');
}

function districtEdges(length: number, count: number, step = 1) {
  return Array.from({ length: count + 1 }, (_, index) =>
    index === count ? length : Math.round(index * length / count / step) * step);
}

export function generateHexCoast(viewport: Size, seed: number) {
  const random = seededRandom(seed);
  // A legacy small board sees the center of a complete coast without shrinking the tiles.
  const width = Math.max(viewport.width, districtSize.width);
  const height = Math.max(viewport.height, districtSize.height);
  const left = Math.floor((viewport.width - width) / 2);
  const top = Math.floor((viewport.height - height) / 2);
  const columns = districtEdges(Math.ceil(width / hexWidth) + 1, Math.round(width / districtSize.width));
  // Start each district on an even row to continue the same stagger across borders.
  const rows = districtEdges(Math.ceil(height / rowHeight) + 2, Math.round(height / districtSize.height), 2);
  const separateIslands = columns.length > 2 || rows.length > 2;
  const tiles: CoastTile[] = [];
  const roads: number[][] = [];
  const towns: number[] = [];
  const buildings = new Map<number, Building>();

  for (let row = 1; row < rows.length; row += 1) {
    for (let column = 1; column < columns.length; column += 1) {
      const grid = coastGrid(columns[column] - columns[column - 1], rows[row] - rows[row - 1]);
      const district = generateDistrict(grid, random, separateIslands);
      const x = left + columns[column - 1] * hexWidth;
      const y = top + rows[row - 1] * rowHeight;
      const idOffset = tiles.length;
      for (const tile of district.tiles) tiles.push({ ...tile, id: tile.id + idOffset, x: tile.x + x, y: tile.y + y });
      roads.push(district.road.map((id) => id + idOffset));
      towns.push(...district.towns.map((id) => id + idOffset));
      for (const [id, building] of district.buildings) buildings.set(id + idOffset, building);
    }
  }
  return { tiles, roads, towns, buildings };
}
