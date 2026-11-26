import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { challengeModes } from '../domain/challengeModes';
import type { PuzzleSnapshot } from '../domain/Puzzle';
import { createPuzzle } from '../domain/puzzleSizes';
import { gameSave } from '../persistence';
import type { PuzzleSetup } from '../persistence/GameSave';
import { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButton } from './button';
import { playHeader } from './playLayout';
import { headerControlGap, headerGap, headerInset, makeSettingsButton } from './puzzleHeader';
import { PuzzleBoardView } from './PuzzleBoardView';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { openSettings } from './SettingsScene';
import { styleWithTheme } from './theme';

export type PuzzleSelection = {
  source: PuzzleSource;
  setup: PuzzleSetup;
  snapshot?: PuzzleSnapshot;
};

// Target length in screen pixels for the shorter side of a tray piece's base cell.
const trayPieceSize = 76.8;
const completionPreviewDuration = 1400;

export class PlayPuzzleScene extends Phaser.Scene {
  static readonly key = 'PlayPuzzle';
  declare rexUI: RexUIPlugin;

  constructor() {
    super(PlayPuzzleScene.key);
  }

  create({ source, setup, snapshot }: PuzzleSelection) {
    const { size, connectorStyle, animationSpeed, seed, challengeMode, pieceRotation } = setup;
    const puzzle = createPuzzle(size, connectorStyle, seed, challengeMode, pieceRotation);
    if (snapshot && !puzzle.restore(snapshot)) throw new Error('Invalid puzzle snapshot');
    const capture = new LivePuzzleCapture(this, source, {
      ...puzzle.board.size, seed: puzzle.seed, animationSpeed,
    });

    const backButton = makeButton(this, headerInset, 0, 'All puzzles', (pointer) => {
      if (!pointer.wasCanceled) this.scene.start(SelectPuzzleScene.key);
    }, 150);
    const settings = makeSettingsButton(this, () => {
      board.cancelInteraction();
      openSettings(this, { onTrayPositionChange: (position) => board.setTrayPosition(position) });
    }, playHeader);
    const title = this.add.text(0, 0, source.title, {
      fontFamily: 'system-ui', fontSize: '34px', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const progress = this.add.text(0, 0, '', {
      fontFamily: 'system-ui', fontSize: '17px',
    }).setOrigin(0, 0.5);
    const challenge = this.add.text(0, 0, `· ${challengeModes[puzzle.challengeMode].label}`, {
      fontFamily: 'system-ui', fontSize: '17px',
    }).setOrigin(0, 0.5);
    styleWithTheme(title, (colors) => {
      title.setColor(colors.text);
      progress.setColor(colors.mutedText);
      challenge.setColor(colors.mutedText);
    });
    const layoutHeader = () => {
      const { width } = this.scale.gameSize;
      const { narrow, buttonY } = playHeader(width);
      backButton.setY(buttonY);
      settings.layout(width);

      const titleX = narrow ? headerInset : backButton.x + backButton.width + headerGap;
      const centerY = narrow ? 87 : buttonY + backButton.height / 2;
      title.setFontSize(narrow ? 20 : 34);
      progress.setFontSize(narrow ? 14 : 17);
      challenge.setFontSize(narrow ? 14 : 17);
      const inlineRight = titleX + title.width + progress.width + challenge.width + 2 * headerControlGap;
      const stacked = narrow || width < 700 || inlineRight + headerGap > settings.button.x;
      if (stacked && !narrow) {
        title.setFontSize(20);
        progress.setFontSize(15);
        challenge.setFontSize(15);
      }

      title.setPosition(titleX, centerY - (stacked ? 10 : 0));
      const progressY = centerY + (stacked ? 11 : 0);
      progress.setPosition(stacked ? titleX : titleX + title.width + headerControlGap, progressY);
      challenge.setPosition(progress.x + progress.width + headerControlGap, progressY);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, layoutHeader);
    const updateProgress = () => {
      progress.setText(`${puzzle.placedCount} of ${puzzle.pieces.length} placed`);
      layoutHeader();
    };
    let completionAction: Phaser.Time.TimerEvent | undefined;
    const saveProgress = () => gameSave.saveProgress(source.scene.key, { setup, ...puzzle.snapshot() });
    const onPlacement = () => {
      updateProgress();
      if (puzzle.isComplete) {
        gameSave.completeAttempt(source.scene.key, { setup, completedAt: new Date().toISOString() });
        board.showCompletion();
        completionAction = this.time.delayedCall(completionPreviewDuration, () => {
          backButton.setText('Choose puzzle').setData('primary', true).layout();
        });
      } else {
        saveProgress();
      }
    };
    const { trayPosition = 'Auto', trayFractions } = gameSave.settings;
    const board = new PuzzleBoardView(this, puzzle, capture, trayPieceSize, {
      position: trayPosition,
      fractions: trayFractions,
      onResize: (fractions) => gameSave.updateSettings({ trayFractions: fractions }),
    }, { onPlacement, onTurn: saveProgress });
    updateProgress();
    capture.start();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layoutHeader);
      completionAction?.remove(false);
      board.destroy();
      capture.destroy();
    });
  }
}
