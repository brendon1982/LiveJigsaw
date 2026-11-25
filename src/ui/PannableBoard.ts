import Phaser from 'phaser';
import type { Point, Size } from '../domain/geometry';
import type { PuzzlePiece } from '../domain/Puzzle';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import { activePuzzleFilter, onPuzzleFilterChange, type PuzzleArtworkFilter } from './puzzleFilter';
import { palette, styleWithTheme } from './theme';

export class PannableBoard {
  readonly layer: Phaser.GameObjects.Layer;
  readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly placedMask: Phaser.Textures.CanvasTexture;
  private readonly placedImage: Phaser.GameObjects.Image;
  private readonly placedPath = new Path2D();
  private viewport = new Phaser.Geom.Rectangle();
  private offset: Point;

  constructor(scene: Phaser.Scene, private readonly size: Size, capture: LivePuzzleCapture) {
    this.offset = { x: -size.width / 2, y: -size.height / 2 };
    this.layer = scene.add.layer();
    this.camera = scene.cameras.add().setName('Puzzle board').setOrigin(0);
    this.camera.inputEnabled = false;
    const guide = scene.add.image(0, 0, capture.texture.key, '__BASE').setOrigin(0)
      .setDisplaySize(size.width, size.height);
    const setGuideOpacity = (colors: typeof palette) => {
      const filtered = activePuzzleFilter === 'grayscale' || activePuzzleFilter === 'faded';
      guide.setAlpha(filtered ? colors.filteredGuideOpacity : colors.guideOpacity);
    };
    styleWithTheme(guide, setGuideOpacity);
    let guideFilter: Phaser.Filters.ColorMatrix | undefined;
    const updateGuideFilter = (filter: PuzzleArtworkFilter | undefined) => {
      setGuideOpacity(palette);
      if (!filter) {
        guideFilter?.setActive(false);
        return;
      }
      guideFilter ??= guide.enableFilters().filters!.internal.addColorMatrix();
      guideFilter.setActive(true);
      const { colorMatrix } = guideFilter;
      switch (filter) {
        case 'grayscale':
          colorMatrix.grayscale();
          break;
        case 'sepia':
          colorMatrix.sepia();
          break;
        case 'faded':
          // Compress the color range and lift the shadows without changing alpha.
          colorMatrix.set([
            0.56, 0.08, 0.08, 0, 36,
            0.08, 0.56, 0.08, 0, 36,
            0.08, 0.08, 0.56, 0, 36,
            0, 0, 0, 1, 0,
          ]);
          break;
      }
    };
    updateGuideFilter(activePuzzleFilter);
    guide.once(Phaser.GameObjects.Events.DESTROY, onPuzzleFilterChange(updateGuideFilter));
    const placedMask = scene.textures.createCanvas('live-puzzle-placed-mask', size.width, size.height);
    if (!placedMask) throw new Error('Could not create the placed pieces mask');
    this.placedMask = placedMask;
    this.placedImage = scene.add.image(0, 0, capture.texture.key, '__BASE').setOrigin(0)
      .setDisplaySize(size.width, size.height).setVisible(false);
    this.placedImage.enableFilters().filters!.internal.addMask(placedMask.key);
    this.layer.add([guide, this.placedImage]);
  }

  addPieces(pieces: readonly PuzzlePiece[]) {
    if (pieces.length === 0) return;
    for (const piece of pieces) {
      const [first, ...rest] = piece.outline.points;
      this.placedPath.moveTo(first.x, first.y);
      for (const point of rest) this.placedPath.lineTo(point.x, point.y);
      this.placedPath.closePath();
    }

    // Fill all placed shapes together so shared edges get full pixel coverage.
    const { context } = this.placedMask;
    context.clearRect(0, 0, this.size.width, this.size.height);
    context.fillStyle = '#fff';
    context.fill(this.placedPath);
    this.placedMask.refresh();
    this.placedImage.setVisible(true);
  }

  destroy() {
    this.placedMask.manager.remove(this.placedMask);
  }

  layout(bounds: Phaser.Geom.Rectangle) {
    const dx = (bounds.width - this.viewport.width) / 2;
    const dy = (bounds.height - this.viewport.height) / 2;
    this.viewport = bounds;
    this.camera.setViewport(bounds.x, bounds.y, bounds.width, bounds.height);
    this.pan(dx, dy);
  }

  contains(point: Point): boolean {
    return this.viewport.contains(point.x, point.y);
  }

  toLocal(point: Point): Point {
    return {
      x: (point.x - this.viewport.x - this.offset.x) / this.zoom,
      y: (point.y - this.viewport.y - this.offset.y) / this.zoom,
    };
  }

  get zoom(): number {
    return this.camera.zoom;
  }

  zoomAt(point: Point, scale: number, previousPoint: Point = point) {
    const anchor = this.toLocal(previousPoint);
    this.camera.setZoom(Phaser.Math.Clamp(this.zoom * scale, 0.5, 2.5));
    this.offset = {
      x: point.x - this.viewport.x - anchor.x * this.zoom,
      y: point.y - this.viewport.y - anchor.y * this.zoom,
    };
    this.pan(0, 0);
  }

  pan(dx: number, dy: number) {
    this.offset = {
      x: this.limitOffset(this.offset.x + dx, this.viewport.width, this.size.width * this.zoom),
      y: this.limitOffset(this.offset.y + dy, this.viewport.height, this.size.height * this.zoom),
    };
    this.camera.setScroll(-this.offset.x / this.zoom, -this.offset.y / this.zoom);
  }

  private limitOffset(offset: number, viewport: number, content: number): number {
    const center = viewport / 2;
    return Phaser.Math.Clamp(offset, center - content, center);
  }
}
