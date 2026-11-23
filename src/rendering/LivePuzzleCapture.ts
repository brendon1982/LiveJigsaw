import Phaser from 'phaser';
import { captureScale } from '../domain/puzzleSizes';
import type { PuzzleSource, PuzzleSourceSceneData } from '../puzzles/PuzzleSource';

export type PuzzleArtworkFilter = 'grayscale' | 'sepia' | 'faded';

export class LivePuzzleCapture {
  readonly texture: Phaser.Textures.DynamicTexture;
  readonly scale: number;
  private readonly sourceScene: Phaser.Scene;
  private filter?: PuzzleArtworkFilter;
  private filteredSource?: ReturnType<LivePuzzleCapture['createFilteredSource']>;

  constructor(
    private readonly host: Phaser.Scene,
    source: PuzzleSource,
    private readonly data: PuzzleSourceSceneData,
  ) {
    const { width, height } = data;
    this.sourceScene = host.scene.get(source.scene.key);
    const renderer = host.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const gl = renderer.gl;
    this.scale = captureScale(data, source.maxViewport, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const texture = host.textures.addDynamicTexture(
      'live-puzzle-output', width * this.scale, height * this.scale,
    );
    if (!texture) throw new Error('Could not create the puzzle render target');
    // The framebuffer is single-sampled. Supersample when the source and GPU have room.
    texture.camera.setOrigin(0).setZoom(this.scale);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.texture = texture;
  }

  start() {
    this.sourceScene.events.once(Phaser.Scenes.Events.CREATE, this.onSourceCreated);
    this.host.scene.launch(this.sourceScene, this.data);
  }

  setFilter(filter: PuzzleArtworkFilter | undefined) {
    this.filter = filter;
    if (!filter) return;

    const { matrix } = this.filteredSource ??= this.createFilteredSource();
    switch (filter) {
      case 'grayscale':
        matrix.grayscale();
        break;
      case 'sepia':
        matrix.sepia();
        break;
      case 'faded':
        // Compress the color range and lift the shadows without changing alpha.
        matrix.set([
          0.56, 0.08, 0.08, 0, 36,
          0.08, 0.56, 0.08, 0, 36,
          0.08, 0.08, 0.56, 0, 36,
          0, 0, 0, 1, 0,
        ]);
        break;
    }
  }

  destroy() {
    this.host.game.events.off(Phaser.Core.Events.POST_STEP, this.refresh);
    this.sourceScene.events.off(Phaser.Scenes.Events.CREATE, this.onSourceCreated);
    this.host.scene.stop(this.sourceScene);
    if (this.filteredSource) {
      this.filteredSource.image.destroy();
      this.host.textures.remove(this.filteredSource.texture);
    }
    this.host.textures.remove(this.texture);
  }

  private createFilteredSource() {
    const texture = this.host.textures.addDynamicTexture('live-puzzle-unfiltered', this.texture.width, this.texture.height);
    if (!texture) throw new Error('Could not create the unfiltered puzzle render target');
    texture.camera.setOrigin(0).setZoom(this.scale);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const image = new Phaser.GameObjects.Image(this.host, 0, 0, texture.key).setOrigin(0)
      .setDisplaySize(this.data.width, this.data.height).enableFilters();
    const { colorMatrix: matrix } = image.filters!.internal.addColorMatrix();
    return { texture, image, matrix };
  }

  private readonly onSourceCreated = () => {
    this.sourceScene.input.enabled = false;
    if (this.sourceScene.input.keyboard) this.sourceScene.input.keyboard.enabled = false;
    this.sourceScene.scene.setVisible(false);
    this.refresh();
    this.host.game.events.on(Phaser.Core.Events.POST_STEP, this.refresh);
  };

  private readonly refresh = () => {
    const source = this.filter ? this.filteredSource : undefined;
    (source?.texture ?? this.texture).clear().draw(this.sourceScene.children).render();
    if (source) {
      // Filter the composited artwork once before the board and pieces sample it.
      this.texture.clear().draw(source.image).render();
    }
  };
}
