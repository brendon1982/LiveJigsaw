import Phaser from 'phaser';
import type SplitPanels from 'phaser4-rex-plugins/templates/ui/splitpanels/SplitPanels.js';
import type { Bounds } from '../domain/geometry';
import type { UIScene } from './button';
import { trayScrollAxis, type TraySide } from './playLayout';
import { styleWithTheme } from './theme';

const dividerThickness = 10;
const preferredBoardMinimum = 260;

export class PuzzlePanels {
  private readonly split: SplitPanels;
  private readonly tray: Phaser.GameObjects.Rectangle;
  private readonly board: Phaser.GameObjects.Rectangle;
  private readonly divider: Phaser.GameObjects.Rectangle;
  private readonly dividerLine: Phaser.GameObjects.Rectangle;
  private readonly grip: Phaser.GameObjects.Graphics;
  private readonly stacked: boolean;
  private readonly trayFirst: boolean;
  private readonly layoutPanels: () => void;

  constructor(
    scene: UIScene,
    side: TraySide,
    onLayout: (trayBounds: Phaser.Geom.Rectangle, boardBounds: Phaser.Geom.Rectangle) => void,
    onResizeTray: (fraction: number) => void,
  ) {
    this.stacked = trayScrollAxis(side) === 'x';
    this.trayFirst = side === 'Left' || side === 'Top';
    this.tray = scene.add.rectangle(0, 0, 1, 1).setDepth(-1);
    this.board = scene.add.rectangle(0, 0, 1, 1).setDepth(-1);
    this.divider = scene.add.rectangle(0, 0, this.stacked ? 1 : dividerThickness, this.stacked ? dividerThickness : 1, 0, 0);
    const { tray, board, divider } = this;
    const first = this.trayFirst ? tray : board;
    const second = this.trayFirst ? board : tray;
    const sides = this.stacked ? { topPanel: first, bottomPanel: second } : { leftPanel: first, rightPanel: second };
    this.split = scene.rexUI.add.splitPanels({ ...sides, splitter: divider }).setOrigin(0);
    if (divider.input) divider.input.cursor = this.stacked ? 'ns-resize' : 'ew-resize';

    this.dividerLine = scene.add.rectangle(0, 0, 1, 1)
      .setOrigin(this.stacked ? 0.5 : 0, this.stacked ? 0 : 0.5).setDepth(1);
    this.grip = scene.add.graphics().setDepth(2).setAngle(this.stacked ? 90 : 0);
    styleWithTheme(tray, (colors) => {
      tray.setFillStyle(colors.tray);
      board.setFillStyle(colors.board);
      this.dividerLine.setFillStyle(colors.dividerLine);
      this.grip.clear().fillStyle(colors.dividerGrip).fillRoundedRect(-4, -16, 8, 32, 3);
      this.grip.fillStyle(colors.dividerDots);
      for (const y of [-8, -3, 3, 8]) {
        this.grip.fillCircle(-2, y, 1).fillCircle(2, y, 1);
      }
    });

    this.layoutPanels = () => {
      if (this.stacked) {
        this.dividerLine.setPosition(divider.x, Math.floor(divider.y)).setDisplaySize(divider.displayWidth, 1);
      } else {
        this.dividerLine.setPosition(Math.floor(divider.x), divider.y).setDisplaySize(1, divider.displayHeight);
      }
      this.grip.setPosition(divider.x, divider.y);
      onLayout(tray.getBounds(), board.getBounds());
    };
    let initialRatio = 0;
    this.split.on('splitter.dragstart', () => { initialRatio = this.split.splitRatio; });
    this.split.on('splitter.drag', this.layoutPanels);
    this.split.on('splitter.dragend', () => {
      const { splitRatio } = this.split;
      if (splitRatio !== initialRatio) onResizeTray(this.trayFirst ? splitRatio : 1 - splitRatio);
    });
  }

  layout({ x, y, width, height }: Bounds, minimumTraySize: number, trayFraction: number) {
    const usable = Math.max(2, (this.stacked ? height : width) - dividerThickness);
    const minimumTray = Math.min(minimumTraySize, usable / 2);
    const minimumBoard = Math.min(preferredBoardMinimum, usable - minimumTray);
    const firstMinimum = this.trayFirst ? minimumTray : minimumBoard;
    const secondMinimum = this.trayFirst ? minimumBoard : minimumTray;
    const fraction = Phaser.Math.Clamp(trayFraction, minimumTray / usable, 1 - minimumBoard / usable);

    if (this.stacked) this.split.setMinTopPanelHeight(firstMinimum).setMinBottomPanelHeight(secondMinimum);
    else this.split.setMinLeftPanelWidth(firstMinimum).setMinRightPanelWidth(secondMinimum);
    // RexUI measures the split's rectangles by display size, so discard the previous layout's sizes.
    this.tray.setDisplaySize(1, 1);
    this.board.setDisplaySize(1, 1);
    this.divider.setDisplaySize(this.stacked ? 1 : dividerThickness, this.stacked ? dividerThickness : 1);
    this.split.setSplitRatio(this.trayFirst ? fraction : 1 - fraction).setPosition(x, y).setMinSize(width, height).layout();
    this.layoutPanels();
  }

  beginTraySlide(): Phaser.Geom.Rectangle {
    this.divider.disableInteractive();
    return this.board.getBounds();
  }

  layoutTraySlide(workspace: Bounds, start: Phaser.Geom.Rectangle, progress: number): Phaser.Geom.Rectangle {
    const mix = Phaser.Math.Linear;
    const { x, y, width, height } = workspace;
    const board = new Phaser.Geom.Rectangle(
      mix(start.x, x, progress), mix(start.y, y, progress),
      mix(start.width, width, progress), mix(start.height, height, progress),
    );
    this.board.setPosition(board.centerX, board.centerY).setDisplaySize(board.width, board.height);

    const workspaceStart = this.stacked ? y : x;
    const workspaceEnd = this.stacked ? y + height : x + width;
    const boardEdge = this.trayFirst
      ? (this.stacked ? board.top : board.left)
      : (this.stacked ? board.bottom : board.right);
    const remaining = this.trayFirst ? boardEdge - workspaceStart : workspaceEnd - boardEdge;
    const gap = Phaser.Math.Clamp(remaining, 0, dividerThickness);
    const traySize = Math.max(0, remaining - gap);
    const trayCenter = this.trayFirst ? workspaceStart + traySize / 2 : workspaceEnd - traySize / 2;
    const dividerCenter = boardEdge + (this.trayFirst ? -gap : gap) / 2;

    if (this.stacked) {
      this.tray.setPosition(board.centerX, trayCenter).setDisplaySize(width, traySize);
      this.dividerLine.setPosition(board.centerX, Math.floor(dividerCenter));
      this.grip.setPosition(board.centerX, dividerCenter);
    } else {
      this.tray.setPosition(trayCenter, board.centerY).setDisplaySize(traySize, height);
      this.dividerLine.setPosition(Math.floor(dividerCenter), board.centerY);
      this.grip.setPosition(dividerCenter, board.centerY);
    }
    this.tray.setVisible(traySize > 0);
    this.dividerLine.setVisible(gap >= 1);
    this.grip.setVisible(gap >= 8);
    return board;
  }

  layoutBoardOnly(workspace: Bounds): Phaser.Geom.Rectangle {
    this.tray.setVisible(false);
    this.dividerLine.setVisible(false);
    this.grip.setVisible(false);
    const center = workspace.center;
    this.board.setPosition(center.x, center.y).setDisplaySize(workspace.width, workspace.height);
    return this.board.getBounds();
  }

  destroy() {
    this.split.destroy();
    this.dividerLine.destroy();
    this.grip.destroy();
  }
}
