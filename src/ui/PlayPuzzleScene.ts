import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { challengeModes } from '../domain/challengeModes';
import { PuzzlePlay, type PuzzlePlaySnapshot } from '../domain/PuzzlePlay';
import { createPuzzle } from '../domain/puzzleSizes';
import { gameSave } from '../persistence';
import type { PuzzleSetup } from '../persistence/GameSave';
import { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButton } from './button';
import { playWorkspace } from './playLayout';
import { headerControlGap, headerInset, makeSettingsButton, puzzleSpacing } from './puzzleHeader';
import { PuzzleBoardView } from './PuzzleBoardView';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { openSettings } from './SettingsScene';
import { styleWithTheme } from './theme';

export type PuzzleSelection = {
  source: PuzzleSource;
  setup: PuzzleSetup;
  snapshot?: PuzzlePlaySnapshot;
};

// Target base-cell area in screen pixels squared, matching the previous short rectangles.
const trayPieceArea = 76.8 * 96;
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
    const play = new PuzzlePlay(puzzle);
    if (snapshot && !play.restore(snapshot)) throw new Error('Invalid puzzle snapshot');
    const capture = new LivePuzzleCapture(this, source, {
      ...puzzle.board.size, seed: puzzle.seed, animationSpeed,
    });

    const backButton = makeButton(this, headerInset, puzzleSpacing, 'All puzzles', (pointer) => {
      if (!pointer.wasCanceled) this.scene.start(SelectPuzzleScene.key);
    }, 150);
    const settings = makeSettingsButton(this, () => {
      board.cancelInteraction();
      openSettings(this, {
        onTrayPositionChange: (position) => board.setTrayPosition(position),
        onAllowLoosePiecesOnBoardChange: (allow) => board.setAllowLoosePiecesOnBoard(allow),
      });
    });
    const title = this.add.text(0, 0, source.title, {
      fontFamily: 'system-ui', fontSize: '34px', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const progress = this.add.text(0, 0, '', {
      fontFamily: 'system-ui', fontSize: '17px',
    }).setOrigin(0, 0.5);
    const challenge = challengeMode === 'none' ? undefined : this.add.text(0, 0, `· ${challengeModes[challengeMode].label}`, {
      fontFamily: 'system-ui', fontSize: '17px',
    }).setOrigin(0, 0.5);
    styleWithTheme(title, (colors) => {
      title.setColor(colors.text);
      progress.setColor(colors.mutedText);
      challenge?.setColor(colors.mutedText);
    });
    const pieceCount = puzzle.pieces.length;
    let headerBottom = 0;
    const layoutHeader = () => {
      const { width } = this.scale.gameSize;
      const narrow = width < 620;
      settings.layout(width);

      const titleX = narrow ? headerInset : backButton.x + backButton.width + puzzleSpacing;
      title.setFontSize(narrow ? 20 : 34);
      progress.setFontSize(narrow ? 14 : 17);
      challenge?.setFontSize(narrow ? 14 : 17);
      const progressWidth = Math.ceil(progress.context.measureText(`${pieceCount} of ${pieceCount} placed`).width);
      const challengeWidth = challenge ? headerControlGap + challenge.width : 0;
      const inlineRight = titleX + title.width + headerControlGap + progressWidth + challengeWidth;
      const stacked = narrow || width < 700 || inlineRight + puzzleSpacing > settings.button.x;
      if (stacked && !narrow) {
        title.setFontSize(20);
        progress.setFontSize(15);
        challenge?.setFontSize(15);
      }

      const progressHeight = Math.max(progress.height, challenge?.height ?? 0);
      const textHeight = stacked ? title.height + progressHeight : Math.max(title.height, progressHeight);
      const buttonHeight = Math.max(backButton.height, settings.button.height);
      const rowHeight = Math.max(buttonHeight, textHeight);
      const textTop = narrow ? puzzleSpacing + buttonHeight + headerControlGap
        : puzzleSpacing + (rowHeight - textHeight) / 2;
      const titleY = textTop + (stacked ? title.height : textHeight) / 2;
      const progressY = stacked ? textTop + title.height + progressHeight / 2 : titleY;
      title.setPosition(titleX, titleY);
      progress.setPosition(stacked ? titleX : titleX + title.width + headerControlGap, progressY);
      challenge?.setPosition(progress.x + progress.width + headerControlGap, progressY);
      headerBottom = narrow ? textTop + textHeight : puzzleSpacing + rowHeight;
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, layoutHeader);
    const updateProgress = () => {
      progress.setText(`${puzzle.placedCount} of ${pieceCount} placed`);
      layoutHeader();
    };
    let completionAction: Phaser.Time.TimerEvent | undefined;
    const saveProgress = () => gameSave.saveProgress(source.scene.key, { setup, ...play.snapshot() });
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
    const { trayPosition = 'Auto', trayFractions, allowLoosePiecesOnBoard } = gameSave.settings;
    updateProgress();
    const board = new PuzzleBoardView(this, play, capture, trayPieceArea, {
      position: trayPosition,
      fractions: trayFractions,
      onResize: (fractions) => gameSave.updateSettings({ trayFractions: fractions }),
    }, { onPlacement, onWorkspaceChange: saveProgress }, allowLoosePiecesOnBoard,
    () => playWorkspace(this.scale.gameSize, headerBottom));
    capture.start();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layoutHeader);
      completionAction?.remove(false);
      board.destroy();
      capture.destroy();
    });
  }
}
