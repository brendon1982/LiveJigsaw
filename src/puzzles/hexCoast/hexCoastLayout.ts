import { seededRandom } from '../../domain/seededRandom.ts';
import { findRoute } from '../procgen/findRoute.ts';

export const coastSize = { width: 1024, height: 576 };
export const terraceHeight = 18;
export const shoreHeight = 12;

const columns = 17;
const rows = 14;
type Random = ReturnType<typeof seededRandom>;
type Biome = 'water' | 'sand' | 'grass' | 'autumn' | 'rock' | 'snow';
export type CoastTile = { id: number; x: number; y: number; level: number; biome: Biome; wooded: boolean };
type Building = { wall: string; upper: string; roof: string; floors: number };

const grid = Array.from({ length: columns * rows }, (_, id) => {
  const column = id % columns;
  const row = Math.floor(id / columns);
  return { id, column, row, x: column * 64 + (row % 2) * 32, y: row * 48 - 16 };
});

const neighbors = grid.map(({ column, row }) => {
  const left = column - 1 + row % 2;
  const right = left + 1;
  return [[column + 1, row], [right, row + 1], [left, row + 1],
    [column - 1, row], [left, row - 1], [right, row - 1]]
    .flatMap(([x, y], heading) => x >= 0 && x < columns && y >= 0 && y < rows
      ? [{ id: y * columns + x, heading }]
      : []);
});

function distance(from: number, to: number) {
  const start = grid[from];
  const end = grid[to];
  const rowDelta = start.row - end.row;
  // Remove the stagger from the grid columns to measure along the hex axes.
  const axialColumnDelta = start.column - Math.floor(start.row / 2) - end.column + Math.floor(end.row / 2);
  return Math.max(Math.abs(rowDelta), Math.abs(axialColumnDelta), Math.abs(rowDelta + axialColumnDelta));
}

function buildable({ level, x, y }: CoastTile) {
  return level === 1 && x >= 56 && x <= 968 && y >= 110 && y <= 523;
}

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

function terrain(random: Random): CoastTile[] {
  const side = random() < 0.5 ? -1 : 1;
  const main = { x: 512 + side * (118 + random() * 62), y: 240 + random() * 80 };
  const island = { x: 512 - side * (266 + random() * 45), y: 155 + random() * 245 };
  const coastWidth = 300 + random() * 88;
  const coastHeight = 180 + random() * 52;
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
  return grid.map(({ id, x, y }) => {
    const coast = Math.max(
      hill(x - main.x, y - main.y, coastWidth, coastHeight),
      hill(x - capeX, y - capeY, 170, 108),
      hill(x - island.x, y - island.y, islandWidth, islandHeight),
    );
    const shoreline = coast + Math.sin(x / 100 + y / 89 + coastPhase) * 0.15
      + Math.cos(x / 115 - y / 65 + coastPhase) * 0.13;
    const mountain = hill(x - peakX, y - peakY, ridgeWidth, ridgeHeight) + Math.sin((x + y) / 63) * 0.12;
    const forest = Math.sin(x / 140 + y / 77 + forestPhase) + Math.cos(x / 118 - y / 115 + forestPhase);
    const autumn = Math.sin(x / 137 - y / 106 + autumnPhase) > 0.60;
    const level = elevation(shoreline, mountain);
    const biome = tileBiome(level, shoreline, autumn);
    const wooded = (biome === 'grass' || biome === 'autumn') && forest + random() * 0.28 > -0.12;
    return { id, x, y, level, biome, wooded };
  });
}

function develop(tiles: CoastTile[], random: Random) {
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
      const buildings = buildSettlements(tiles, road, harbor, village, random);
      if (buildings) return { road, towns: [harbor.id, village.id], buildings };
    }
  }
}

function buildSettlements(tiles: CoastTile[], road: number[], harbor: CoastTile, village: CoastTile, random: Random) {
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

export function generateHexCoast(seed: number) {
  const random = seededRandom(seed);
  // Keep the shore intact while testing road placements. Roll new terrain only if it cannot support both towns.
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const tiles = terrain(random);
    const settlement = develop(tiles, random);
    if (settlement) return { tiles, ...settlement };
  }
  throw new Error('The coast could not find room for both settlements');
}
