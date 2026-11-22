import Phaser from 'phaser';
import './style.css';

const previewWidth = 512;
const previewHeight = 288;
const textureKey = 'windmill-preview';

class PreviewScene extends Phaser.Scene {
  create() {
    const source = this.textures.addDynamicTexture(textureKey, previewWidth, previewHeight);
    if (!source) {
      throw new Error('Could not create the windmill preview texture');
    }

    const landscape = new Phaser.GameObjects.Graphics(this);
    landscape.fillStyle(0xc0dddb).fillRect(0, 0, previewWidth, previewHeight);
    landscape.fillStyle(0xfdf0ba).fillCircle(393, 66, 27);
    landscape.fillStyle(0x91ae87).fillEllipse(115, 223, 360, 115);
    landscape.fillStyle(0x789774).fillEllipse(385, 243, 355, 150);
    landscape.fillStyle(0x587f68).fillRect(0, 235, previewWidth, 53);
    landscape.fillStyle(0xead7ac).fillRect(226, 151, 60, 91);
    landscape.fillStyle(0xa25b48).fillTriangle(216, 151, 256, 118, 296, 151);
    landscape.fillStyle(0x755344).fillRect(249, 206, 14, 36);

    const sails = new Phaser.GameObjects.Graphics(this, { x: 256, y: 151 });
    for (let turn = 0; turn < 4; turn += 1) {
      sails.save();
      sails.rotateCanvas(turn * Math.PI / 2);
      sails.fillStyle(0x755344).fillRect(-2, -63, 4, 64);
      sails.fillStyle(0xfff4d9).fillRect(2, -63, 10, 37);
      sails.restore();
    }
    sails.fillStyle(0x755344).fillCircle(0, 0, 5);

    const halfWidth = previewWidth / 2;
    source.add('left', 0, 0, 0, halfWidth, previewHeight);
    source.add('right', 0, halfWidth, 0, halfWidth, previewHeight);
    this.add.image(0, 0, textureKey, 'left').setOrigin(0);
    this.add.image(halfWidth + 8, 0, textureKey, 'right').setOrigin(0);

    const refresh = (time: number) => {
      sails.setRotation(time * 0.00035);
      source.clear().draw([landscape, sails]).render();
    };
    refresh(0);

    const timer = this.time.addEvent({
      delay: 1000 / 30,
      loop: true,
      callback: () => refresh(this.time.now),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      timer.remove();
      landscape.destroy();
      sails.destroy();
      this.textures.remove(source);
    });
  }
}

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: previewWidth + 8,
  height: previewHeight,
  backgroundColor: '#263a36',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: PreviewScene,
});
