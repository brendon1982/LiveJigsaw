import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import type { ConnectorStyleId } from '../domain/connectorStyles';
import { createPuzzle, type PuzzleSize } from '../domain/puzzleSizes';
import { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButton, mutedColor, textColor } from './button';
import { PuzzleBoardView } from './PuzzleBoardView';
import { SelectPuzzleScene } from './SelectPuzzleScene';

export type PuzzleSelection = { source: PuzzleSource; size: PuzzleSize; connectorStyle?: ConnectorStyleId; seed: number };

// Target length in screen pixels for the shorter side of a tray piece's base cell.
const trayPieceSize = 76.8;

export class PlayPuzzleScene extends Phaser.Scene {
  static readonly key = 'PlayPuzzle';
  declare rexUI: RexUIPlugin;

  constructor() {
    super(PlayPuzzleScene.key);
  }

  create({ source, size, connectorStyle, seed }: PuzzleSelection) {
    const puzzle = createPuzzle(size, connectorStyle, seed);
    const capture = new LivePuzzleCapture(this, source, { ...puzzle.board.size, seed: puzzle.seed });

    const backButton = makeButton(this, 24, 22, 'All puzzles', () => this.scene.start(SelectPuzzleScene.key), 150);
    const title = this.add.text(196, 0, source.title, {
      fontFamily: 'system-ui', fontSize: '34px', fontStyle: 'bold', color: textColor,
    }).setOrigin(0, 0.5);
    const progress = this.add.text(0, 0, '', {
      fontFamily: 'system-ui', fontSize: '17px', color: mutedColor,
    }).setOrigin(0, 0.5);
    const layoutHeader = () => {
      const compact = this.scale.gameSize.width < 540;
      const centerY = backButton.y + backButton.height / 2;
      title.setFontSize(compact ? 20 : 34).setY(centerY - (compact ? 10 : 0));
      progress.setPosition(compact ? title.x : title.x + title.width + 16, centerY + (compact ? 11 : 0));
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, layoutHeader);
    layoutHeader();
    const updateProgress = () => {
      progress.setText(`${puzzle.placedCount} of ${puzzle.pieces.length} placed`);
    };
    const board = new PuzzleBoardView(this, puzzle, capture, trayPieceSize, updateProgress);
    updateProgress();
    capture.start();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layoutHeader);
      board.destroy();
      capture.destroy();
    });
  }
}
