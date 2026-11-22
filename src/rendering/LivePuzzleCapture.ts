import Phaser from 'phaser';
import type { Bounds } from '../domain/geometry';
import type { PuzzleSource } from '../sources/PuzzleSource';

export class LivePuzzleCapture {
  readonly texture: Phaser.Textures.DynamicTexture;
  readonly scale = 2;
  private readonly sourceScene: Phaser.Scene;
  private ready = false;
  private direct = false;

  constructor(
    private readonly host: Phaser.Scene,
    source: PuzzleSource,
    private readonly viewport: Bounds,
  ) {
    this.sourceScene = host.scene.get(source.scene.key);
    const texture = host.textures.addDynamicTexture(
      'live-puzzle-output', viewport.width * this.scale, viewport.height * this.scale,
    );
    if (!texture) throw new Error('Could not create the puzzle render target');
    // The framebuffer is single-sampled. Capture at 2× and filter at display size.
    texture.camera.setOrigin(0).setZoom(this.scale);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.texture = texture;
  }

  start() {
    this.sourceScene.events.once(Phaser.Scenes.Events.CREATE, this.onSourceCreated);
    this.host.scene.launch(this.sourceScene, { width: this.viewport.width, height: this.viewport.height });
  }

  showDirect(direct: boolean) {
    this.direct = direct;
    if (this.ready) this.sourceScene.scene.setVisible(direct);
  }

  destroy() {
    this.host.game.events.off(Phaser.Core.Events.POST_STEP, this.refresh);
    this.sourceScene.events.off(Phaser.Scenes.Events.CREATE, this.onSourceCreated);
    this.host.scene.stop(this.sourceScene);
    this.host.textures.remove(this.texture);
  }

  private readonly onSourceCreated = () => {
    const { x, y, width, height } = this.viewport;
    this.sourceScene.input.enabled = false;
    if (this.sourceScene.input.keyboard) this.sourceScene.input.keyboard.enabled = false;
    this.sourceScene.cameras.main.setViewport(x, y, width, height);
    this.ready = true;
    this.showDirect(this.direct);
    this.refresh();
    this.host.game.events.on(Phaser.Core.Events.POST_STEP, this.refresh);
  };

  private readonly refresh = () => {
    if (!this.direct) this.texture.clear().draw(this.sourceScene.children).render();
  };
}
