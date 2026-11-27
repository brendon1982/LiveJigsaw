import Phaser from 'phaser';
import { puzzleAnimationRates, type PuzzleSourceSceneData } from '../PuzzleSource';
import atlasImage from './assets/medievalRTS_spritesheet@2.png';
import atlasData from './assets/medievalRTS_spritesheet@2.xml?url';
import { bladePadding, cellSize, generateVillage } from './villageLayout';
import { walkPose } from './villageWalks';

const atlasKey = 'medieval-village-artwork';
const frameName = (kind: string, id: number) => `medieval${kind}_${String(id).padStart(2, '0')}.png`;

function assembledBuilding(textures: Phaser.Textures.TextureManager, frames: readonly number[]) {
  const key = `${atlasKey}-building-${frames.join('-')}`;
  if (textures.exists(key)) return key;

  // Join the atlas cuts at native size before linear filtering samples across the seam.
  const parts = frames.map((id) => textures.getFrame(atlasKey, frameName('Structure', id)));
  const width = Math.max(...parts.map((part) => part.realWidth));
  const height = parts.reduce((sum, part) => sum + part.realHeight, 0);
  const texture = textures.createCanvas(key, width, height);
  if (!texture) throw new Error(`Could not assemble building ${key}`);

  let bottom = height;
  for (const part of parts) {
    bottom -= part.realHeight;
    texture.drawFrame(atlasKey, part.name, (width - part.realWidth) / 2, bottom, false);
  }
  texture.refresh();
  return key;
}

function windmillBlades(textures: Phaser.Textures.TextureManager, id: number) {
  const key = `${atlasKey}-blades-${id}`;
  if (textures.exists(key)) return key;

  const frame = textures.getFrame(atlasKey, frameName('Structure', id));
  const padding = bladePadding;
  const texture = textures.createCanvas(key, frame.realWidth + 2 * padding, frame.realHeight + 2 * padding);
  if (!texture) throw new Error(`Could not isolate windmill blades ${id}`);

  // Keep linear filtering clear of nearby atlas art as the blades rotate.
  texture.drawFrame(atlasKey, frame.name, padding, padding, false);
  if (id === 15) {
    // This crop includes two rows of stray pixels above the blade tips.
    texture.context.clearRect(padding, padding, frame.realWidth, 2);
  }
  texture.refresh();
  return key;
}

export class MedievalVillageScene extends Phaser.Scene {
  static readonly key = 'MedievalVillage';
  private animate?: (delta: number) => void;

  constructor() {
    super(MedievalVillageScene.key);
  }

  preload() {
    if (!this.textures.exists(atlasKey)) this.load.atlasXML(atlasKey, atlasImage, atlasData);
  }

  create(data: PuzzleSourceSceneData) {
    if (!this.textures.exists(atlasKey)) return;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.animate = undefined; });
    this.drawVillage(data);
  }

  private drawVillage({ width, height, seed, animationSpeed }: PuzzleSourceSceneData) {
    const village = this.add.container();
    const atlas = this.textures.get(atlasKey);
    const { columns, origin, ground, props, mills, walks } = generateVillage({ width, height }, seed, (id) => {
      const frame = atlas.get(frameName('Structure', id));
      return { width: frame.realWidth, height: frame.realHeight };
    });
    const sprite = (x: number, y: number, kind: string, frame: number, scale: number) =>
      this.add.image(x, y, atlasKey, frameName(kind, frame)).setScale(scale);
    const tileScale = cellSize / 128;
    // Each road overlay follows its tile. The depth-sorted scenery goes above the entire ground.
    ground.forEach(({ frame, road }, index) => {
      const x = origin.x + (index % columns) * cellSize;
      const y = origin.y + Math.floor(index / columns) * cellSize;
      village.add(sprite(x, y, 'Tile', frame, tileScale).setOrigin(0));
      if (road) {
        const roadX = x + road.x * tileScale;
        const roadY = y + road.y * tileScale;
        village.add(sprite(roadX, roadY, 'Tile', road.frame, tileScale).setOrigin(0));
      }
    });
    const scenery = this.add.container();
    village.add(scenery);
    for (const { x, y, kind, frames, scale } of props) {
      const image = frames.length === 1
        ? sprite(x, y, kind, frames[0], scale)
        : this.add.image(x, y, assembledBuilding(this.textures, frames)).setScale(scale);
      scenery.add(image.setOrigin(0.5, 1).setDepth(y));
    }
    const blades = mills.map((mill) => {
      const texture = windmillBlades(this.textures, mill.blades);
      const image = this.add.image(mill.x, mill.y - mill.hub, texture)
        .setScale(mill.bladeScale).setDepth(mill.y + 0.01);
      scenery.add(image);
      return image;
    });
    const villagers = walks.map((walk) => {
      const image = sprite(0, 0, 'Unit', walk.front, 0.28).setOrigin(0.5, 1);
      scenery.add(image);
      return { walk, image };
    });

    let elapsed = 0;
    this.animate = (delta) => {
      elapsed += delta * puzzleAnimationRates[animationSpeed];
      for (const rotor of blades) rotor.rotation = elapsed * 0.00085;
      for (const { walk, image } of villagers) {
        const { x, y, bob, frame, flip } = walkPose(walk, elapsed);
        const name = frameName('Unit', frame);
        if (image.frame.name !== name) image.setFrame(name);
        image.setPosition(x, y - bob).setDepth(y).setFlipX(flip);
      }
      scenery.sort('depth');
    };
    this.animate(0);
  }

  update(_time: number, delta: number) {
    this.animate?.(delta);
  }
}
