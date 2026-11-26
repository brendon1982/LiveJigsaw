import Phaser from 'phaser';
import type ScrollablePanel from 'phaser4-rex-plugins/templates/ui/scrollablepanel/ScrollablePanel.js';
import type { Point, Size } from '../domain/geometry';
import type { UIScene } from './button';
import type { TrayScrollAxis } from './playLayout';
import type { PuzzlePieceView } from './PuzzlePieceView';
import { styleWithTheme } from './theme';

const scrollbarSpace = 24;
const pieceSpacing = 4;

export class PieceTray {
  readonly layer: Phaser.GameObjects.Layer;
  readonly pieceScale: number;
  readonly camera: Phaser.Cameras.Scene2D.Camera;
  private content: Phaser.GameObjects.Zone;
  private panel: ScrollablePanel;
  private readonly cellWidth: number;
  private readonly cellHeight: number;
  private crossAxisSlots = 1;
  private clip = new Phaser.Geom.Rectangle();
  private entries: PuzzlePieceView[];
  private lifted?: PuzzlePieceView;
  private lastOffset = 0;

  constructor(
    private readonly scene: UIScene,
    entries: PuzzlePieceView[],
    cellSize: Size,
    targetPieceArea: number,
    private axis: TrayScrollAxis,
    pieceRotation: boolean,
  ) {
    this.entries = entries;
    const cellArea = cellSize.width * cellSize.height;
    this.pieceScale = Math.sqrt(targetPieceArea / cellArea);
    const slotSizes = entries.map(({ frame, piece }) => {
      const { x, y } = frame.toLocal(piece.target);
      // The base-cell center can be off-center in the image when only one side has a tab.
      return {
        width: Math.max(frame.width * this.pieceScale + pieceSpacing, 2 * Math.max(x, frame.width - x) * this.pieceScale + 2),
        height: Math.max(frame.height * this.pieceScale + pieceSpacing, 2 * Math.max(y, frame.height - y) * this.pieceScale + 2),
      };
    });
    const uprightWidth = Math.ceil(Math.max(...slotSizes.map(({ width }) => width)));
    const uprightHeight = Math.ceil(Math.max(...slotSizes.map(({ height }) => height)));
    // A square slot fits the same pivot-centered bounds at every quarter turn.
    const rotatedSize = Math.max(uprightWidth, uprightHeight);
    this.cellWidth = pieceRotation ? rotatedSize : uprightWidth;
    this.cellHeight = pieceRotation ? rotatedSize : uprightHeight;
    this.layer = scene.add.layer();
    this.camera = scene.cameras.add().setName('Piece tray');
    this.camera.inputEnabled = false;

    ({ content: this.content, panel: this.panel } = this.createPanel());
    for (const entry of entries) {
      entry.addTo(this.layer);
      entry.setScale(this.pieceScale);
    }
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncScroll);
  }

  get minimumSize(): number {
    return (this.axis === 'y' ? this.cellWidth : this.cellHeight) + scrollbarSpace;
  }

  setScrollAxis(axis: TrayScrollAxis) {
    if (axis === this.axis) return;
    this.panel.destroy();
    this.axis = axis;
    ({ content: this.content, panel: this.panel } = this.createPanel());
  }

  private createPanel() {
    const { scene } = this;
    const vertical = this.axis === 'y';
    const content = scene.add.zone(0, 0, 0, 0).setOrigin(0);
    const track = scene.rexUI.add.roundRectangle(0, 0, vertical ? 6 : 10, vertical ? 10 : 6, 3);
    const thumb = scene.rexUI.add.roundRectangle(0, 0, vertical ? 8 : 36, vertical ? 36 : 8, 4);
    const panel = scene.rexUI.add.scrollablePanel({
      scrollMode: this.axis,
      panel: { child: content, mask: false },
      scroller: false,
      clampChildOY: true,
      slider: {
        track, thumb,
        adaptThumbSize: true,
        minThumbSize: 36,
        hideUnscrollableSlider: true,
      },
      space: vertical ? { left: 4, right: 8, sliderY: 6 } : { top: 4, bottom: 8, sliderX: 6 },
    }).setOrigin(0);
    styleWithTheme(panel, (colors) => {
      track.setFillStyle(colors.scrollbarTrack);
      thumb.setFillStyle(colors.scrollbarThumb);
    });

    return { content, panel };
  }

  layout(bounds: Phaser.Geom.Rectangle) {
    const vertical = this.axis === 'y';
    const crossAxisSize = vertical ? bounds.width : bounds.height;
    const slotSize = vertical ? this.cellWidth : this.cellHeight;
    this.crossAxisSlots = Math.max(1, Math.floor((crossAxisSize - scrollbarSpace) / slotSize));
    const occupiedCrossSlots = Math.min(this.crossAxisSlots, this.entries.length);
    const scrollAxisSlots = Math.ceil(this.entries.length / this.crossAxisSlots);
    const columns = vertical ? occupiedCrossSlots : scrollAxisSlots;
    const rows = vertical ? scrollAxisSlots : occupiedCrossSlots;
    this.content.setSize(columns * this.cellWidth, rows * this.cellHeight);

    // RexUI uses childOY for the active axis in either single-axis mode.
    const offset = this.panel.childOY;
    this.panel.setPosition(bounds.x, bounds.y).setMinSize(bounds.width, bounds.height).layout();
    this.panel.setChildOY(offset, true);
    const clipWidth = vertical ? Math.max(1, bounds.width - scrollbarSpace) : bounds.width;
    const clipHeight = vertical ? bounds.height : Math.max(1, bounds.height - scrollbarSpace);
    this.clip.setTo(bounds.x, bounds.y, clipWidth, clipHeight);
    this.camera.setViewport(this.clip.x, this.clip.y, this.clip.width, this.clip.height)
      .setScroll(this.clip.x, this.clip.y);
    this.syncPositions();
  }

  pieceAt(point: Point): PuzzlePieceView | undefined {
    if (!this.clip.contains(point.x, point.y)) return;
    return this.entries.find((entry) => entry !== this.lifted && entry.contains(point));
  }

  canScrollFrom(point: Point): boolean {
    return this.clip.contains(point.x, point.y);
  }

  refreshVisibility(entry: PuzzlePieceView) {
    entry.setVisible(entry.intersects(this.clip));
  }

  scrollBy(pixels: number) {
    this.panel.setChildOY(this.panel.childOY + pixels, true);
  }

  lift(entry: PuzzlePieceView) {
    this.lifted = entry;
    entry.setVisible(true);
  }

  returnPiece(entry: PuzzlePieceView) {
    this.lifted = undefined;
    entry.addTo(this.layer);
    entry.setScale(this.pieceScale);
    this.syncPositions();
  }

  remove(entry: PuzzlePieceView, bounds: Phaser.Geom.Rectangle) {
    this.lifted = undefined;
    this.entries = this.entries.filter((candidate) => candidate !== entry);
    this.layout(bounds);
  }

  hide() {
    this.panel.setVisible(false);
    this.layer.setVisible(false);
    this.clip.setTo(0, 0, 0, 0);
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncScroll);
  }

  private readonly syncScroll = () => {
    if (this.panel.childOY !== this.lastOffset) this.syncPositions();
  };

  private syncPositions() {
    this.lastOffset = this.panel.childOY;
    const vertical = this.axis === 'y';
    const { x: left, y: top } = this.content;
    for (const [index, entry] of this.entries.entries()) {
      if (entry === this.lifted) continue;
      const crossIndex = index % this.crossAxisSlots;
      const scrollIndex = Math.floor(index / this.crossAxisSlots);
      const column = vertical ? crossIndex : scrollIndex;
      const row = vertical ? scrollIndex : crossIndex;
      entry.moveTo(left + (column + 0.5) * this.cellWidth, top + (row + 0.5) * this.cellHeight);
      this.refreshVisibility(entry);
    }
  }
}
