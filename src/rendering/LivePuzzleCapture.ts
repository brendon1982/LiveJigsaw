import Phaser from 'phaser';
import type { Size } from '../domain/geometry';
import { captureScale } from '../domain/puzzleSizes';
import type { PuzzleSource } from '../sources/PuzzleSource';

export class LivePuzzleCapture {
  readonly texture: Phaser.Textures.DynamicTexture;
  readonly scale: number;
  private readonly sourceScene: Phaser.Scene;

  constructor(
    private readonly host: Phaser.Scene,
    source: PuzzleSource,
    private readonly size: Size,
  ) {
    this.sourceScene = host.scene.get(source.scene.key);
    const renderer = host.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const gl = renderer.gl;
    this.scale = captureScale(size, source.maxViewport, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const texture = host.textures.addDynamicTexture(
      'live-puzzle-output', size.width * this.scale, size.height * this.scale,
    );
    if (!texture) throw new Error('Could not create the puzzle render target');
    // The framebuffer is single-sampled. Supersample when the source and GPU have room.
    texture.camera.setOrigin(0).setZoom(this.scale);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.texture = texture;
  }

  start() {
    this.sourceScene.events.once(Phaser.Scenes.Events.CREATE, this.onSourceCreated);
    this.host.scene.launch(this.sourceScene, this.size);
  }

  destroy() {
    this.host.game.events.off(Phaser.Core.Events.POST_STEP, this.refresh);
    this.sourceScene.events.off(Phaser.Scenes.Events.CREATE, this.onSourceCreated);
    this.host.scene.stop(this.sourceScene);
    this.host.textures.remove(this.texture);
  }

  private readonly onSourceCreated = () => {
    this.sourceScene.input.enabled = false;
    if (this.sourceScene.input.keyboard) this.sourceScene.input.keyboard.enabled = false;
    this.sourceScene.scene.setVisible(false);
    this.refresh();
    this.host.game.events.on(Phaser.Core.Events.POST_STEP, this.refresh);
  };

  private readonly refresh = () => {
    this.texture.clear().draw(this.sourceScene.children).render();
  };
}
