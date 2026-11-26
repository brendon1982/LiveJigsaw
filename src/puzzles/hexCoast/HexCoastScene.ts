import Phaser from 'phaser';
import type { Size } from '../../domain/geometry';
import { seededRandom } from '../../domain/seededRandom';
import { puzzleAnimationRates, type PuzzleSourceSceneData } from '../PuzzleSource';
import buildingImage from './assets/buildings.png';
import buildingAtlas from './assets/buildings.xml?url';
import detailImage from './assets/details.png';
import detailAtlas from './assets/details.xml?url';
import terrainImage from './assets/fullTiles.png';
import terrainAtlas from './assets/fullTiles.xml?url';
import treeImage from './assets/trees.png';
import treeAtlas from './assets/trees.xml?url';
import { generateHexCoast, shoreHeight, terraceHeight, type CoastTile } from './hexCoastLayout';
import { scatterHexScenery } from './hexCoastScenery';

const sheets = [
  ['terrain', terrainImage, terrainAtlas],
  ['details', detailImage, detailAtlas],
  ['trees', treeImage, treeAtlas],
  ['buildings', buildingImage, buildingAtlas],
] as const;
type Sheet = typeof sheets[number][0];
const textureKey = (sheet: Sheet) => `hex-coast-${sheet}`;
const groundFrames = {
  water: 'tileWater_full', sand: 'tileSand_full', grass: 'tileGrass', autumn: 'tileAutumn',
  rock: 'tileRock_full', snow: 'tileSnow_full',
};
const tileOriginY = 32 / 89;
const wallHeight = 23;

type Wave = { image: Phaser.GameObjects.Image; x: number; y: number; phase: number };
type RoadPoint = Pick<CoastTile, 'x' | 'y'>;
type RoadStroke = { from: RoadPoint; to: RoadPoint };
type CoastArtwork = ReturnType<typeof generateHexCoast>;
type Random = ReturnType<typeof seededRandom>;
type AddSprite = (sheet: Sheet, frame: string, x: number, y: number, scale?: number, originY?: number) => Phaser.GameObjects.Image;

function roadStrokesByRow(roads: CoastTile[][]) {
  const rows = new Map<number, RoadStroke[]>();
  const add = (from: RoadPoint, to: RoadPoint) => {
    const row = rows.get(from.y);
    if (row) row.push({ from, to });
    else rows.set(from.y, [{ from, to }]);
  };
  const halfStroke = (from: RoadPoint, to: RoadPoint) => {
    // Extend just past the midpoint so the diagonal halves cover their seam.
    add(from, { x: from.x + (to.x - from.x) * 0.52, y: from.y + (to.y - from.y) * 0.52 });
  };

  for (const road of roads) {
    for (let index = 1; index < road.length; index += 1) {
      const from = road[index - 1];
      const to = road[index];
      if (to.y === from.y) {
        while (road[index + 1]?.y === from.y) index += 1;
        add(from, road[index]);
      } else {
        halfStroke(from, to);
        halfStroke(to, from);
      }
    }
  }
  return rows;
}

function landTilesByRow(tiles: CoastTile[]) {
  const rows = new Map<number, CoastTile[]>();
  for (const tile of tiles) {
    const row = rows.get(tile.y);
    if (row) row.push(tile);
    else rows.set(tile.y, [tile]);
  }
  return rows;
}

function surfaceY({ y, level }: CoastTile) {
  return y - shoreHeight - (level - 1) * terraceHeight;
}

function shoreDistances(land: CoastTile[]) {
  const deepWaterDistance = 243;
  const buckets = new Map<string, CoastTile[]>();
  const bucket = (coordinate: number) => Math.floor(coordinate / deepWaterDistance);
  for (const tile of land) {
    const key = `${bucket(tile.x)},${bucket(tile.y)}`;
    const tiles = buckets.get(key);
    if (tiles) tiles.push(tile);
    else buckets.set(key, [tile]);
  }
  return (x: number, y: number) => {
    const column = bucket(x);
    const row = bucket(y);
    let nearest = deepWaterDistance;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (const tile of buckets.get(`${column + dx},${row + dy}`) ?? []) {
          nearest = Math.min(nearest, Math.hypot(x - tile.x, y - tile.y));
        }
      }
    }
    return nearest;
  };
}

export class HexCoastScene extends Phaser.Scene {
  static readonly key = 'HexCoast';
  private waves: Wave[] = [];
  private elapsed = 0;
  private animationRate = 1;

  constructor() {
    super(HexCoastScene.key);
  }

  preload() {
    for (const [sheet, image, atlas] of sheets) {
      const key = textureKey(sheet);
      if (!this.textures.exists(key)) this.load.atlasXML(key, image, atlas);
    }
  }

  create({ seed, animationSpeed, ...viewport }: PuzzleSourceSceneData) {
    this.elapsed = 0;
    this.animationRate = puzzleAnimationRates[animationSpeed];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.waves = []; });
    const coast = generateHexCoast(viewport, seed);
    const random = seededRandom((seed ^ 0x5d3b6c17) >>> 0);
    this.drawCoast(coast, viewport, random);
    this.update(0, 0);
  }

  private drawCoast({ tiles, roads, towns, buildings }: CoastArtwork, viewport: Size, random: Random) {
    const backToFront = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
    const land = backToFront.filter((tile) => tile.biome !== 'water');
    const map = this.add.container();
    map.add(this.add.rectangle(0, 0, viewport.width, viewport.height, 0x6ebacf).setOrigin(0));
    const sprite: AddSprite = (sheet, frame, x, y, scale = 1, originY = 1) => {
      const image = this.add.image(x, y, textureKey(sheet), `${frame}.png`).setOrigin(0.5, originY).setScale(scale);
      map.add(image);
      return image;
    };
    const ground = (frame: string, x: number, y: number) => sprite('terrain', frame, x, y, 1, tileOriginY);

    this.drawWater(backToFront, land, sprite, random);

    const strokes = roadStrokesByRow(roads.map((road) => road.map((id) => tiles[id])));
    const roadIds = new Set(roads.flat());
    const townIds = new Set(towns);
    // Finish each row before drawing the next, so the foreground can cover the row behind it.
    for (const [rowY, row] of landTilesByRow(land)) {
      drawGround(row);
      const streets = strokes.get(rowY);
      if (streets) map.add(this.drawStreets(streets, row, roadIds, townIds));
      drawScenery(row);
    }

    function drawGround(row: CoastTile[]) {
      for (const tile of row) {
        const { x, y, level, biome } = tile;
        for (let below = 0; below < level - 1; below += 1) {
          ground('tileRock_full', x, y - shoreHeight - below * terraceHeight);
        }
        ground(groundFrames[biome], x, surfaceY(tile));
      }
    }

    function drawScenery(row: CoastTile[]) {
      const scenery: { footY: number; draw: () => void }[] = [];
      for (const tile of row) {
        const { id, x } = tile;
        if (roadIds.has(id)) continue;
        const surface = surfaceY(tile);
        const building = buildings.get(id);
        if (building) {
          scenery.push({ footY: surface, draw: () => {
            const scale = building.floors === 2 ? 0.75 : 0.66;
            map.add(map.scene.add.ellipse(x + 4, surface + 9, 43, 22, 0x465c3c, 0.28));
            for (let floor = 1; floor <= building.floors; floor += 1) {
              sprite('buildings', floor === 1 ? building.wall : building.upper,
                x, surface - floor * wallHeight * scale, scale, tileOriginY);
            }
            sprite('buildings', building.roof, x, surface + (32 - building.floors * wallHeight) * scale, scale);
          } });
          continue;
        }
        for (const detail of scatterHexScenery(tile, random)) {
          const footY = surface + detail.y;
          scenery.push({ footY, draw: () =>
            sprite(detail.sheet, detail.frame, x + detail.x, footY, detail.scale) });
        }
      }
      scenery.sort((a, b) => a.footY - b.footY);
      for (const feature of scenery) feature.draw();
    }
  }

  private drawWater(tiles: CoastTile[], land: CoastTile[], sprite: AddSprite, random: Random) {
    const distanceToShore = shoreDistances(land);
    for (const { x, y, level } of tiles) {
      const distanceToLand = level ? 0 : distanceToShore(x, y);
      const depth = Math.max(0, Math.min(1, (distanceToLand - 38) / 205));
      const red = 255 - Math.round(52 * depth);
      const green = 255 - Math.round(36 * depth);
      const blue = 255 - Math.round(22 * depth);
      const tint = Phaser.Display.Color.GetColor(red, green, blue);
      sprite('terrain', groundFrames.water, x, y, 1, tileOriginY).setTint(tint);

      const waveChance = depth < 0.55 ? 0.39 : 0.25;
      if (!level && random() < waveChance) {
        const waveX = x + (random() - 0.5) * 35;
        const waveY = y + (random() - 0.5) * 30;
        const scale = 0.38 + random() * 0.44;
        const image = sprite('details', 'waveWater', waveX, waveY, scale, 0.5);
        this.waves.push({ image, x: waveX, y: waveY, phase: random() * Math.PI * 2 });
      }
    }
  }

  private drawStreets(strokes: RoadStroke[], row: CoastTile[], roadIds: Set<number>, townIds: Set<number>) {
    const street = this.add.graphics();
    for (const [width, color] of [[10, 0xb18756], [7, 0xe0bd78]]) {
      street.lineStyle(width, color);
      street.beginPath();
      for (const { from, to } of strokes) {
        street.moveTo(from.x, from.y - shoreHeight);
        street.lineTo(to.x, to.y - shoreHeight);
      }
      street.strokePath();
      street.fillStyle(color);
      for (const { id, x, y } of row) {
        if (!roadIds.has(id)) continue;
        const radius = townIds.has(id) ? width * 0.9 : width / 2;
        street.fillCircle(x, y - shoreHeight, radius);
      }
    }
    return street;
  }

  update(_time: number, delta: number) {
    this.elapsed += delta * this.animationRate;
    for (const { image, x, y, phase } of this.waves) {
      const swell = this.elapsed / 875 + phase;
      image.setPosition(x + Math.sin(swell) * 8, y + Math.cos(swell) * 2.5)
        .setAlpha(0.24 + 0.45 * (0.5 + Math.sin(swell - 0.7) * 0.5));
    }
  }
}
