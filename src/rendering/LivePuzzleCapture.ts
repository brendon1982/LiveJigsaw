import Phaser from 'phaser';
import type { PuzzleSource, PuzzleSourceSceneData } from '../puzzles/PuzzleSource';

export class LivePuzzleCapture {
  readonly texture: Phaser.Textures.DynamicTexture;
  private readonly sourceScene: Phaser.Scene;
  private onSourceCreated?: () => void;
  private loadFailed = false;

  constructor(
    private readonly host: Phaser.Scene,
    private readonly source: PuzzleSource,
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
    const texture = host.textures.addDynamicTexture('live-puzzle-output', width, height, false);
    if (!texture) throw new Error('Could not create the puzzle render target');
    texture.camera.setOrigin(0);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.texture = texture;
  }

  start(onReady: () => void, onLoadFailed: () => void) {
    this.onSourceCreated = () => {
      this.sourceScene.input.enabled = false;
      if (this.sourceScene.input.keyboard) this.sourceScene.input.keyboard.enabled = false;
      this.sourceScene.scene.setVisible(false);
      if (this.loadFailed) {
        onLoadFailed();
        return;
      }
      this.refresh();
      if (this.source.motion === 'Animated') this.host.game.events.on(Phaser.Core.Events.POST_STEP, this.refresh);
      onReady();
    };
    this.sourceScene.load.once(Phaser.Loader.Events.COMPLETE, this.onLoadComplete);
    this.sourceScene.events.once(Phaser.Scenes.Events.CREATE, this.onSourceCreated);
    this.host.scene.launch(this.sourceScene, this.data);
  }

  destroy() {
    this.host.game.events.off(Phaser.Core.Events.POST_STEP, this.refresh);
    if (this.onSourceCreated) this.sourceScene.events.off(Phaser.Scenes.Events.CREATE, this.onSourceCreated);
    this.sourceScene.load.off(Phaser.Loader.Events.COMPLETE, this.onLoadComplete);
    this.host.scene.stop(this.sourceScene);
    this.host.textures.remove(this.texture);
  }

  private readonly onLoadComplete = (_loader: Phaser.Loader.LoaderPlugin, _loaded: number, failed: number) => {
    this.loadFailed = failed > 0;
  };

  private readonly refresh = () => {
    this.texture.clear().draw(this.sourceScene.children).render();
  };
}
