import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { createPuzzle, type PuzzleSize } from '../domain/puzzleSizes';
import { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import type { PuzzleSource } from '../sources/PuzzleSource';
import { makeButton, mutedColor, textColor } from './button';
import { PuzzleBoardView } from './PuzzleBoardView';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { hasTouchTargets } from './touchLayout';

type Selection = { source: PuzzleSource; size: PuzzleSize };

export class PlayPuzzleScene extends Phaser.Scene {
  static readonly key = 'PlayPuzzle';
  declare rexUI: RexUIPlugin;

  constructor() {
    super(PlayPuzzleScene.key);
  }

  create({ source, size }: Selection) {
    const puzzle = createPuzzle(size);
    const capture = new LivePuzzleCapture(this, source, puzzle.board.size);

    makeButton(this, 24, 22, 'All puzzles', () => this.scene.start(SelectPuzzleScene.key), 150);
    const title = this.add.text(196, 19, source.title, {
      fontFamily: 'system-ui', fontSize: '34px', fontStyle: 'bold', color: textColor,
    });
    const helpStyle = { fontFamily: 'system-ui', fontSize: '17px', color: mutedColor };
    this.add.text(24, 88, 'Pieces', helpStyle);
    const progress = this.add.text(196, 88, '', helpStyle);
    const boardHelp = this.add.text(0, 88, hasTouchTargets() ? 'Drag to pan · Pinch to zoom' : 'Drag to pan · Scroll to zoom',
      helpStyle).setOrigin(1, 0);
    const positionHelp = () => {
      const { width } = this.scale.gameSize;
      title.setFontSize(width < 440 ? 24 : 34);
      boardHelp.setX(width - 24).setVisible(width >= 520);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, positionHelp);
    positionHelp();
    const updateProgress = () => {
      progress.setText(puzzle.isComplete
        ? 'Puzzle complete'
        : `${puzzle.placedCount} of ${puzzle.pieces.length} placed`);
    };
    const board = new PuzzleBoardView(this, puzzle, capture, updateProgress);
    updateProgress();
    capture.start();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, positionHelp);
      board.destroy();
      capture.destroy();
    });
  }
}
