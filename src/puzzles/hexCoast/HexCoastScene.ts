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
import { coastSize, generateHexCoast, shoreHeight, terraceHeight } from './hexCoastLayout';

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
    const choose = (frames: string[]) => frames[Math.floor(random() * frames.length)];
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

    const roadIndex = new Map(road.map((id, index) => [id, index]));
    for (const tile of land) {
      const { id, x, y, level, biome, wooded } = tile;
      for (let below = 0; below < level - 1; below += 1) {
        ground('tileRock_full', x, y - shoreHeight - below * terraceHeight);
      }
      const surface = y - shoreHeight - (level - 1) * terraceHeight;
      ground(groundFrames[biome], x, surface);

      const index = roadIndex.get(id);
      if (index !== undefined) {
        const paths = [road[index - 1], road[index + 1]].filter((neighbor) => neighbor !== undefined);
        const street = this.add.graphics();
        for (const [width, color] of [[10, 0xb18756], [7, 0xe0bd78]]) {
          street.lineStyle(width, color);
          street.beginPath();
          for (const neighbor of paths) {
            street.moveTo(x, surface);
            street.lineTo((x + tiles[neighbor].x) / 2, (y + tiles[neighbor].y) / 2 - shoreHeight);
          }
          street.strokePath();
          street.fillStyle(color).fillCircle(x, surface, towns.includes(id) ? width * 0.9 : width / 2);
        }
        map.add(street);
        continue;
      }

      const building = buildings.get(id);
      if (building) {
        const scale = building.floors === 2 ? 0.75 : 0.66;
        const shadow = this.add.ellipse(x + 4, surface + 9, 43, 22, 0x465c3c, 0.28);
        map.add(shadow);
        for (let floor = 1; floor <= building.floors; floor += 1) {
          sprite('buildings', floor === 1 ? building.wall : building.upper,
            x, surface - floor * wallHeight * scale, scale, tileOriginY);
        }
        sprite('buildings', building.roof, x, surface + (32 - building.floors * wallHeight) * scale, scale);
        continue;
      }

      if (wooded && random() < 0.87) {
        const season = biome === 'autumn' ? 'Autumn' : 'Green';
        sprite('trees', `pine${season}_${choose(['high', 'mid', 'low'])}`, x - 8, surface + 3, 0.4 + random() * 0.2);
        if (random() < 0.61) {
          sprite('trees', `tree${season}_${choose(['high', 'mid', 'low'])}`, x + 12, surface + 13, 0.36 + random() * 0.16);
        }
      } else if ((biome === 'rock' || biome === 'snow') && random() < 0.65) {
        sprite('details', biome === 'snow' ? 'smallRockSnow' : 'smallRockStone', x + 4, surface + 12, 0.72);
      } else if ((biome === 'grass' || biome === 'autumn') && random() < 0.64) {
        const flower = choose(['flowerYellow', 'flowerWhite', 'flowerRed']);
        sprite('details', flower, x - 12, surface + 8, 0.86);
        sprite('details', flower, x + 3, surface + 16, 0.7);
        if (random() < 0.38) sprite('details', 'bushGrass', x + 12, surface, 0.87);
      }
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
