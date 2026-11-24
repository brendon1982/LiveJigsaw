import Phaser from 'phaser';
import type { PuzzleAnimationSpeed, PuzzleSourceSceneData } from '../PuzzleSource';
import atlasImage from './assets/medievalRTS_spritesheet@2.png';
import atlasData from './assets/medievalRTS_spritesheet@2.xml?url';
import { cellSize, generateVillage, villageSize } from './villageLayout';
import { walkPose } from './villageWalks';

const atlasKey = 'medieval-village-artwork';
const animationRate: Record<PuzzleAnimationSpeed, number> = { Slow: 0.5, Normal: 1, Fast: 2 };
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
  const padding = 2;
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

  create({ width, height, seed, animationSpeed }: PuzzleSourceSceneData) {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.animate = undefined; });
    const drawVillage = () => {
      const village = this.add.container().setScale(width / villageSize.width, height / villageSize.height);
      const atlas = this.textures.get(atlasKey);
      const { ground, props, mill, walks } = generateVillage(seed, (id) => {
        const frame = atlas.get(frameName('Structure', id));
        return { width: frame.realWidth, height: frame.realHeight };
      });
      const sprite = (x: number, y: number, kind: string, frame: number, scale: number) =>
        this.add.image(x, y, atlasKey, frameName(kind, frame)).setScale(scale);
      const columns = villageSize.width / cellSize;
      const tileScale = cellSize / 128;
      ground.forEach(({ frame, road }, index) => {
        const x = (index % columns) * cellSize;
        const y = Math.floor(index / columns) * cellSize;
        village.add(sprite(x, y, 'Tile', frame, tileScale).setOrigin(0));
        if (road) {
          village.add(sprite(x + road.x * tileScale, y + road.y * tileScale, 'Tile', road.frame, tileScale).setOrigin(0));
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
      const bladeScale = mill.blades === 13 ? 0.51 : 0.45;
      const blades = this.add.image(mill.x, mill.y - mill.hub, windmillBlades(this.textures, mill.blades))
        .setScale(bladeScale).setDepth(mill.y + 0.01);
      scenery.add(blades);
      const villagers = walks.map((walk) => {
        const image = sprite(0, 0, 'Unit', walk.front, 0.28).setOrigin(0.5, 1);
        scenery.add(image);
        return { walk, image };
      });

      let elapsed = 0;
      this.animate = (delta) => {
        elapsed += delta * animationRate[animationSpeed];
        blades.rotation = elapsed * 0.00085;
        for (const { walk, image } of villagers) {
          const { x, y, bob, frame, flip } = walkPose(walk, elapsed);
          const name = frameName('Unit', frame);
          if (image.frame.name !== name) image.setFrame(name);
          image.setPosition(x, y - bob).setDepth(y).setFlipX(flip);
        }
        scenery.sort('depth');
      };
      this.animate(0);
    };

    if (this.textures.exists(atlasKey)) {
      drawVillage();
      return;
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const unit = Math.min(width / villageSize.width, height / villageSize.height);
    const backdrop = this.add.rectangle(0, 0, width, height, 0x17392d).setOrigin(0);
    const label = this.add.text(centerX, centerY - 13 * unit, 'Loading village…', {
      fontFamily: 'system-ui', fontSize: `${22 * unit}px`, color: '#f9e6af',
    }).setOrigin(0.5);
    const track = this.add.rectangle(centerX, centerY + 16 * unit, 150 * unit, 5 * unit, 0x355c48);
    const bar = this.add.rectangle(track.x - track.width / 2, track.y, track.width, track.height, 0xdca352)
      .setOrigin(0, 0.5).setScale(0, 1);
    const showProgress = (progress: number) => bar.setScale(progress, 1);
    const cleanUp = () => {
      this.load.off(Phaser.Loader.Events.PROGRESS, showProgress);
      this.load.off(Phaser.Loader.Events.COMPLETE, onComplete);
    };
    const onComplete = () => {
      cleanUp();
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanUp);
      if (!this.textures.exists(atlasKey)) {
        label.setText('Could not load the village');
        track.destroy();
        bar.destroy();
        return;
      }
      [backdrop, label, track, bar].forEach((object) => object.destroy());
      drawVillage();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanUp);
    this.load.on(Phaser.Loader.Events.PROGRESS, showProgress);
    this.load.once(Phaser.Loader.Events.COMPLETE, onComplete);
    // Start inside create so the scene can be captured while the loader is running.
    this.load.atlasXML(atlasKey, atlasImage, atlasData).start();
  }

  update(_time: number, delta: number) {
    this.animate?.(delta);
  }
}
