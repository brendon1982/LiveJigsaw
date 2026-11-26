import Phaser from 'phaser';
import { Bounds, type Point, type Size } from '../domain/geometry';
import type { PuzzlePiece } from '../domain/Puzzle';
import type { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import { activePuzzleFilter, onPuzzleFilterChange, type PuzzleArtworkFilter } from './puzzleFilter';
import { palette, styleWithTheme } from './theme';

export class PannableBoard {
  readonly layer: Phaser.GameObjects.Layer;
  readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly guide: Phaser.GameObjects.Image;
  private readonly border?: Phaser.GameObjects.Rectangle;
  private readonly placedMask: Phaser.Textures.CanvasTexture;
  private readonly placedImage: Phaser.GameObjects.Image;
  private readonly placedPath = new Path2D();
  private viewport = new Phaser.Geom.Rectangle();
  private offset: Point;
  private usesFitZoom = false;
  private showingFinishedArtwork = false;

  constructor(
    private readonly scene: Phaser.Scene, private readonly size: Size, capture: LivePuzzleCapture, hideGuide = false,
  ) {
    this.offset = { x: -size.width / 2, y: -size.height / 2 };
    this.layer = scene.add.layer();
    this.camera = scene.cameras.add().setName('Puzzle board').setOrigin(0);
    this.camera.inputEnabled = false;
    const guide = scene.add.image(0, 0, capture.texture.key, '__BASE').setOrigin(0)
      .setDisplaySize(size.width, size.height);
    this.guide = guide;
    const setGuideOpacity = (colors: typeof palette) => {
      if (this.showingFinishedArtwork) return;
      const filtered = activePuzzleFilter === 'grayscale' || activePuzzleFilter === 'faded';
      guide.setAlpha(filtered ? colors.filteredGuideOpacity : colors.guideOpacity);
    };
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
    if (hideGuide) {
      guide.setAlpha(0);
      const border = scene.add.rectangle(0, 0, size.width, size.height).setOrigin(0);
      styleWithTheme(border, (colors) => border.setStrokeStyle(2, colors.border));
      this.border = border;
      this.layer.add(border);
    } else {
      styleWithTheme(guide, setGuideOpacity);
      updateGuideFilter(activePuzzleFilter);
      guide.once(Phaser.GameObjects.Events.DESTROY, onPuzzleFilterChange(updateGuideFilter));
    }
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

  revealFinishedArtwork() {
    this.showingFinishedArtwork = true;
    this.border?.setVisible(false);
    const artwork = this.scene.add.image(0, 0, this.placedImage.texture, '__BASE').setOrigin(0)
      .setDisplaySize(this.size.width, this.size.height).setAlpha(0);
    this.layer.add(artwork);
    const fade = { duration: 420, ease: 'Sine.Out' };
    this.scene.tweens.add({ ...fade, targets: this.guide, alpha: 0 });
    this.scene.tweens.add({
      ...fade, targets: artwork, alpha: 1,
      onComplete: () => this.placedImage.setVisible(false),
    });
  }

  destroy() {
    this.placedMask.manager.remove(this.placedMask);
  }

  layout(bounds: Phaser.Geom.Rectangle) {
    const keepFitted = this.usesFitZoom && this.isFitted;
    const dx = (bounds.width - this.viewport.width) / 2;
    const dy = (bounds.height - this.viewport.height) / 2;
    this.setViewport(bounds);
    if (keepFitted) {
      this.fit();
    } else {
      this.offset = { x: this.offset.x + dx, y: this.offset.y + dy };
      this.zoomAt({ x: bounds.centerX, y: bounds.centerY }, 1);
    }
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

  toScreen(point: Point): Point {
    return {
      x: this.viewport.x + this.offset.x + point.x * this.zoom,
      y: this.viewport.y + this.offset.y + point.y * this.zoom,
    };
  }

  get zoom(): number {
    return this.camera.zoom;
  }

  get reachableBounds(): Bounds {
    const marginX = this.panMargin(this.viewport.width);
    const marginY = this.panMargin(this.viewport.height);
    return new Bounds(-marginX, -marginY, this.size.width + 2 * marginX, this.size.height + 2 * marginY);
  }

  get isFitted(): boolean {
    const zoom = this.fitZoom;
    const centered = this.centeredOffset(zoom);
    return this.isZoomAt(zoom)
      && Math.abs(this.offset.x - centered.x) <= 0.01
      && Math.abs(this.offset.y - centered.y) <= 0.01;
  }

  get isNativeSize(): boolean {
    return this.isZoomAt(1);
  }

  private isZoomAt(zoom: number): boolean {
    return Math.abs(this.zoom - zoom) <= 0.0001;
  }

  fit() {
    this.usesFitZoom = true;
    this.centerAt(this.fitZoom);
  }

  showNativeSize() {
    this.usesFitZoom = false;
    const center = { x: this.viewport.centerX, y: this.viewport.centerY };
    this.setZoomAt(center, 1);
  }

  private centerAt(zoom: number) {
    this.camera.setZoom(zoom);
    this.offset = this.centeredOffset(this.zoom);
    this.pan(0, 0);
  }

  beginFitTransition(workspace: Bounds) {
    const startZoom = this.zoom;
    const startingCenter = this.centeredOffset(startZoom);
    const panX = this.offset.x - startingCenter.x;
    const panY = this.offset.y - startingCenter.y;
    const zoomToFit = this.zoomToFit(workspace);
    return (bounds: Phaser.Geom.Rectangle, progress: number) => {
      this.setViewport(bounds);
      const zoom = Phaser.Math.Linear(startZoom, zoomToFit, progress);
      this.camera.setZoom(zoom);
      const center = this.centeredOffset(zoom);
      this.offset = { x: center.x + panX * (1 - progress), y: center.y + panY * (1 - progress) };
      this.pan(0, 0);
    };
  }

  zoomAt(point: Point, scale: number, previousPoint: Point = point) {
    const zoom = Phaser.Math.Clamp(this.zoom * scale, this.minimumZoom, 2.5);
    this.setZoomAt(point, zoom, previousPoint);
  }

  private setZoomAt(point: Point, zoom: number, previousPoint: Point = point) {
    const anchor = this.toLocal(previousPoint);
    this.camera.setZoom(zoom);
    this.offset = {
      x: point.x - this.viewport.x - anchor.x * this.zoom,
      y: point.y - this.viewport.y - anchor.y * this.zoom,
    };
    this.pan(0, 0);
  }

  pan(dx: number, dy: number) {
    this.offset = {
      x: this.limitOffset(this.offset.x + dx, this.viewport.width, this.size.width),
      y: this.limitOffset(this.offset.y + dy, this.viewport.height, this.size.height),
    };
    this.camera.setScroll(-this.offset.x / this.zoom, -this.offset.y / this.zoom);
  }

  private get fitZoom(): number {
    return this.zoomToFit(this.viewport);
  }

  private get minimumZoom(): number {
    return Math.min(0.5, this.fitZoom);
  }

  private zoomToFit({ width, height }: Size): number {
    return Math.min(1, width / this.size.width, height / this.size.height);
  }

  private setViewport(bounds: Phaser.Geom.Rectangle) {
    this.viewport = bounds;
    this.camera.setViewport(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  private centeredOffset(zoom: number): Point {
    return {
      x: (this.viewport.width - this.size.width * zoom) / 2,
      y: (this.viewport.height - this.size.height * zoom) / 2,
    };
  }

  private limitOffset(offset: number, viewportLength: number, guideLength: number): number {
    const screenMargin = this.panMargin(viewportLength) * this.zoom;
    const minOffset = viewportLength - guideLength * this.zoom - screenMargin;
    return Phaser.Math.Clamp(offset, minOffset, screenMargin);
  }

  private panMargin(viewportLength: number): number {
    return viewportLength / (2 * this.minimumZoom);
  }
}
