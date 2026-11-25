import Phaser from 'phaser';
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
import { coastSize, generateHexCoast, shoreHeight, terraceHeight, type CoastTile } from './hexCoastLayout';
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

function roadStrokes(road: CoastTile[]) {
  const rows = new Map<number, { from: RoadPoint; to: RoadPoint }[]>();
  const add = (from: RoadPoint, to: RoadPoint) => {
    const row = rows.get(from.y);
    if (row) row.push({ from, to });
    else rows.set(from.y, [{ from, to }]);
  };
  const halfStroke = (from: RoadPoint, to: RoadPoint) => {
    // Extend just past the midpoint so the diagonal halves cover their seam.
    add(from, { x: from.x + (to.x - from.x) * 0.52, y: from.y + (to.y - from.y) * 0.52 });
  };

  for (let index = 1; index < road.length; index += 1) {
    const from = road[index - 1];
    if (road[index].y === from.y) {
      while (road[index + 1]?.y === from.y) index += 1;
      add(from, road[index]);
    } else {
      halfStroke(from, road[index]);
      halfStroke(road[index], from);
    }
  }
  return rows;
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

  create({ width, height, seed, animationSpeed }: PuzzleSourceSceneData) {
    this.elapsed = 0;
    this.animationRate = puzzleAnimationRates[animationSpeed];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.waves = []; });
    const { tiles, road, towns, buildings } = generateHexCoast(seed);
    const land = tiles.filter((tile) => tile.biome !== 'water');
    const random = seededRandom((seed ^ 0x5d3b6c17) >>> 0);
    const map = this.add.container().setScale(width / coastSize.width, height / coastSize.height);
    map.add(this.add.rectangle(0, 0, coastSize.width, coastSize.height, 0x6ebacf).setOrigin(0));
    const sprite = (sheet: Sheet, frame: string, x: number, y: number, scale = 1, originY = 1) => {
      const image = this.add.image(x, y, textureKey(sheet), `${frame}.png`).setOrigin(0.5, originY).setScale(scale);
      map.add(image);
      return image;
    };
    const ground = (frame: string, x: number, y: number) => sprite('terrain', frame, x, y, 1, tileOriginY);

    for (const { x, y, level } of tiles) {
      const distance = level ? 0 : Math.min(...land.map((tile) => Math.hypot(x - tile.x, y - tile.y)));
      const depth = Math.max(0, Math.min(1, (distance - 38) / 205));
      const tint = Phaser.Display.Color.GetColor(255 - Math.round(52 * depth), 255 - Math.round(36 * depth),
        255 - Math.round(22 * depth));
      ground(groundFrames.water, x, y).setTint(tint);
      if (!level && random() < (depth < 0.55 ? 0.39 : 0.25)) {
        const waveX = x + (random() - 0.5) * 35;
        const waveY = y + (random() - 0.5) * 30;
        const image = sprite('details', 'waveWater', waveX, waveY, 0.38 + random() * 0.44, 0.5);
        this.waves.push({ image, x: waveX, y: waveY, phase: random() * Math.PI * 2 });
      }
    }

    const landRows = new Map<number, typeof land>();
    for (const tile of land) {
      const row = landRows.get(tile.y);
      if (row) row.push(tile);
      else landRows.set(tile.y, [tile]);
    }
    const strokes = roadStrokes(road.map((id) => tiles[id]));
    const roadIds = new Set(road);
    for (const [rowY, row] of landRows) {
      for (const { x, y, level, biome } of row) {
        for (let below = 0; below < level - 1; below += 1) {
          ground('tileRock_full', x, y - shoreHeight - below * terraceHeight);
        }
        ground(groundFrames[biome], x, y - shoreHeight - (level - 1) * terraceHeight);
      }

      // Paint the whole row's ground first, then draw straight streets as single strokes.
      const streets = strokes.get(rowY);
      if (streets) {
        const street = this.add.graphics();
        for (const [width, color] of [[10, 0xb18756], [7, 0xe0bd78]]) {
          street.lineStyle(width, color);
          street.beginPath();
          for (const { from, to } of streets) {
            street.moveTo(from.x, from.y - shoreHeight);
            street.lineTo(to.x, to.y - shoreHeight);
          }
          street.strokePath();
          street.fillStyle(color);
          for (const { id, x, y } of row) {
            if (roadIds.has(id)) street.fillCircle(x, y - shoreHeight, towns.includes(id) ? width * 0.9 : width / 2);
          }
        }
        map.add(street);
      }

      const scenery: { y: number; draw: () => void }[] = [];
      for (const tile of row) {
        const { id, x, y, level } = tile;
        if (roadIds.has(id)) continue;
        const surface = y - shoreHeight - (level - 1) * terraceHeight;
        const building = buildings.get(id);
        if (building) {
          scenery.push({ y: surface, draw: () => {
            const scale = building.floors === 2 ? 0.75 : 0.66;
            map.add(this.add.ellipse(x + 4, surface + 9, 43, 22, 0x465c3c, 0.28));
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
          scenery.push({ y: footY, draw: () =>
            sprite(detail.sheet, detail.frame, x + detail.x, footY, detail.scale) });
        }
      }
      scenery.sort((a, b) => a.y - b.y);
      for (const feature of scenery) feature.draw();
    }
    this.update(0, 0);
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
