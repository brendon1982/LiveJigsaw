import Phaser from 'phaser';
import type { PuzzleSource, PuzzleSourceSceneData } from '../puzzles/PuzzleSource';

export class LivePuzzleCapture {
  readonly texture: Phaser.Textures.DynamicTexture;
  private readonly sourceScene: Phaser.Scene;

  constructor(
    private readonly host: Phaser.Scene,
    source: PuzzleSource,
    private readonly data: PuzzleSourceSceneData,
  ) {
    const { width, height } = data;
    this.sourceScene = host.scene.get(source.scene.key);
    const renderer = host.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const gl = renderer.gl;
    const textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (width > textureLimit || height > textureLimit) {
      throw new RangeError('The puzzle exceeds the available texture size');
    }
    const texture = host.textures.addDynamicTexture('live-puzzle-output', width, height);
    if (!texture) throw new Error('Could not create the puzzle render target');
    texture.camera.setOrigin(0);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.texture = texture;
  }

  start() {
    this.sourceScene.events.once(Phaser.Scenes.Events.CREATE, this.onSourceCreated);
    this.host.scene.launch(this.sourceScene, this.data);
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
