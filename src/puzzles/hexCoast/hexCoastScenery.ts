import type { seededRandom } from '../../domain/seededRandom.ts';
import type { CoastTile } from './hexCoastLayout.ts';

type Random = ReturnType<typeof seededRandom>;
type ScenerySprite = { sheet: 'details' | 'trees'; frame: string; scale: number };
type Placement = ScenerySprite & { x: number; y: number; radius: number };

const flowers = ['flowerBlue', 'flowerGreen', 'flowerRed', 'flowerWhite', 'flowerYellow'];
const grasses = ['bushAutumn', 'bushDirt', 'bushGrass', 'bushMagic', 'bushSand', 'bushSnow'];
const boulders = ['smallRockDirt', 'smallRockGrass', 'smallRockSnow', 'smallRockStone'];
const hills = ['hillAutumn', 'hillDirt', 'hillGrass', 'hillMagic', 'hillSand', 'hillSnow'];

export function scatterHexScenery({ biome, wooded }: Pick<CoastTile, 'biome' | 'wooded'>, random: Random) {
  const placements: Placement[] = [];
  if (biome === 'water') return placements;
  const choose = (frames: string[]) => frames[Math.floor(random() * frames.length)];
  function place(sprite: ScenerySprite, radius: number) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const x = (random() - 0.5) * 56;
      const y = (random() - 0.5) * 56;
      // The ground face runs 32px from its center to the side and to either tip.
      // Inset the footprint from those edges, including the sloped sides.
      const side = Math.abs(x) + radius;
      if (side > 29 || Math.abs(y) + radius * 0.6 + side / 2 > 29) continue;
      if (placements.some((other) => Math.hypot(x - other.x, (y - other.y) * 1.35) < radius + other.radius)) continue;
      placements.push({ ...sprite, x, y, radius });
      return;
    }
  }

  const meadow = biome === 'grass' || biome === 'autumn';
  const exposed = biome === 'rock' || biome === 'snow';
  const trees = wooded ? Math.floor(random() * 5) : random() < (meadow ? 0.13 : 0.09) ? 1 : 0;
  for (let index = 0; index < trees; index += 1) {
    const season = biome === 'autumn' ? 'Autumn' : exposed ? 'Blue' : 'Green';
    const frame = biome === 'sand' ? choose(['treeCactus_1', 'treeCactus_2', 'treeCactus_3'])
      : `${choose(['pine', 'tree'])}${season}_${choose(['high', 'mid', 'low'])}`;
    const scale = 0.34 + random() * 0.24;
    place({ sheet: 'trees', frame, scale }, 5 + scale * 7);
  }

  const rocks = random() < (exposed ? 0.86 : 0.24) ? 1 + Math.floor(random() * 2) : 0;
  for (let index = 0; index < rocks; index += 1) {
    const scale = 0.60 + random() * 0.29;
    place({ sheet: 'details', frame: choose(boulders), scale }, 7 + scale * 4);
  }
  if (random() < (exposed ? 0.20 : 0.10)) {
    const scale = 0.65 + random() * 0.22;
    place({ sheet: 'details', frame: choose(hills), scale }, 8 + scale * 4);
  }

  const groundCover = random() < (meadow ? 0.83 : 0.45) ? 1 + Math.floor(random() * (meadow ? 5 : 3)) : 0;
  for (let index = 0; index < groundCover; index += 1) {
    const flowering = random() < 0.58;
    const scale = 0.62 + random() * 0.37;
    place({ sheet: 'details', frame: choose(flowering ? flowers : grasses), scale }, flowering ? 3.5 : 5);
  }
  return placements;
}
