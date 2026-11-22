import Phaser from 'phaser';
import type GridSizer from 'phaser4-rex-plugins/templates/ui/gridsizer/GridSizer.js';
import type ScrollablePanel from 'phaser4-rex-plugins/templates/ui/scrollablepanel/ScrollablePanel.js';
import type { Point } from '../domain/geometry';
import type { UIScene } from './button';
import type { PuzzlePieceView } from './PuzzlePieceView';

const thumbnailScale = 0.6;
const scrollbarSpace = 24;

export class PieceTray {
  readonly layer: Phaser.GameObjects.Layer;
  readonly minimumWidth: number;
  readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly grid: GridSizer;
  private readonly panel: ScrollablePanel;
  private readonly cellWidth: number;
  private readonly cellHeight: number;
  private readonly slots: Phaser.GameObjects.Zone[] = [];
  private columns = 0;
  private clip = new Phaser.Geom.Rectangle();
  private entries: PuzzlePieceView[];
  private lifted?: PuzzlePieceView;
  private lastOffset = 0;

  constructor(private readonly scene: UIScene, entries: PuzzlePieceView[]) {
    this.entries = entries;
    const widest = Math.max(...entries.map(({ piece }) => piece.outline.frame.width));
    const tallest = Math.max(...entries.map(({ piece }) => piece.outline.frame.height));
    this.cellWidth = Math.ceil(widest * thumbnailScale) + 16;
    this.cellHeight = Math.ceil(tallest * thumbnailScale) + 16;
    this.minimumWidth = this.cellWidth + scrollbarSpace;
    this.layer = scene.add.layer();
    this.camera = scene.cameras.add().setName('Piece tray');
    this.camera.inputEnabled = false;

    this.grid = scene.rexUI.add.gridSizer({ column: 1, row: 1 });
    this.panel = scene.rexUI.add.scrollablePanel({
      panel: { child: this.grid, mask: false },
      scroller: false,
      clampChildOY: true,
      mouseWheelScroller: { focus: 2, speed: 0.75 },
      slider: {
        track: scene.rexUI.add.roundRectangle(0, 0, 6, 10, 3, 0x35534b),
        thumb: scene.rexUI.add.roundRectangle(0, 0, 8, 36, 4, 0x9cb5a7),
        adaptThumbSize: true,
        minThumbSize: 36,
        hideUnscrollableSlider: true,
      },
      space: { left: 4, right: 8, sliderY: 6 },
    }).setOrigin(0);

    for (const entry of entries) this.returnPiece(entry);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncScroll);
  }

  layout(bounds: Phaser.Geom.Rectangle) {
    const columns = Math.max(1, Math.floor((bounds.width - scrollbarSpace) / this.cellWidth));
    if (columns !== this.columns) this.rebuildGrid(columns);

    const offset = this.panel.childOY;
    this.panel.setPosition(bounds.x, bounds.y).setMinSize(bounds.width, bounds.height).layout();
    this.panel.setChildOY(offset, true);
    this.clip.setTo(bounds.x, bounds.y, Math.max(1, bounds.width - scrollbarSpace), bounds.height);
    this.camera.setViewport(this.clip.x, this.clip.y, this.clip.width, this.clip.height)
      .setScroll(this.clip.x, this.clip.y);
    this.syncPositions();
  }

  pieceAt(point: Point): PuzzlePieceView | undefined {
    if (!this.clip.contains(point.x, point.y)) return;
    return this.entries.find((entry) => entry.contains(point));
  }

  canScrollFrom(point: Point): boolean {
    return this.clip.contains(point.x, point.y);
  }

  scrollBy(pixels: number) {
    this.panel.setChildOY(this.panel.childOY + pixels, true);
  }

  lift(entry: PuzzlePieceView, boardZoom: number) {
    this.lifted = entry;
    entry.setScale(boardZoom);
  }

  returnPiece(entry: PuzzlePieceView) {
    this.lifted = undefined;
    entry.addTo(this.layer);
    entry.setScale(thumbnailScale);
    this.syncPositions();
  }

  remove(entry: PuzzlePieceView, bounds: Phaser.Geom.Rectangle) {
    this.lifted = undefined;
    this.entries = this.entries.filter((candidate) => candidate !== entry);
    this.rebuildGrid(this.columns);
    this.layout(bounds);
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncScroll);
  }

  private rebuildGrid(columns: number) {
    this.columns = columns;
    this.grid.removeAll(true).resetGrid(columns, Math.max(1, Math.ceil(this.entries.length / columns)));
    this.slots.length = 0;
    for (const [index] of this.entries.entries()) {
      const slot = this.scene.add.zone(0, 0, this.cellWidth, this.cellHeight);
      this.slots.push(slot);
      this.grid.add(slot, index % columns, Math.floor(index / columns));
    }
  }

  private readonly syncScroll = () => {
    if (this.panel.childOY !== this.lastOffset) this.syncPositions();
  };

  private syncPositions() {
    this.lastOffset = this.panel.childOY;
    for (const [index, slot] of this.slots.entries()) {
      const entry = this.entries[index];
      if (entry !== this.lifted) entry.moveTo(slot.x, slot.y);
    }
  }
}
