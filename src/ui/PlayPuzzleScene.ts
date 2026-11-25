import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { createPuzzle } from '../domain/puzzleSizes';
import { gameSave } from '../persistence';
import type { PuzzleSetup } from '../persistence/GameSave';
import { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButton } from './button';
import { headerControlGap, headerGap, headerInset, makeSettingsButton, puzzleHeader } from './puzzleHeader';
import { PuzzleBoardView } from './PuzzleBoardView';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { openSettings } from './SettingsScene';
import { styleWithTheme } from './theme';

export type PuzzleSelection = {
  source: PuzzleSource;
  setup: PuzzleSetup;
  placedPieceIds?: readonly string[];
};

// Target length in screen pixels for the shorter side of a tray piece's base cell.
const trayPieceSize = 76.8;

export class PlayPuzzleScene extends Phaser.Scene {
  static readonly key = 'PlayPuzzle';
  declare rexUI: RexUIPlugin;

  constructor() {
    super(PlayPuzzleScene.key);
  }

  create({ source, setup, placedPieceIds = [] }: PuzzleSelection) {
    const { size, connectorStyle, animationSpeed, seed } = setup;
    const puzzle = createPuzzle(size, connectorStyle, seed);
    if (!puzzle.restorePlacements(placedPieceIds)) throw new Error('Invalid puzzle placements');
    const capture = new LivePuzzleCapture(this, source, {
      ...puzzle.board.size, seed: puzzle.seed, animationSpeed,
    });

    const backButton = makeButton(this, headerInset, 0, 'All puzzles', () => this.scene.start(SelectPuzzleScene.key), 150);
    const settings = makeSettingsButton(this, () => {
      board.cancelInteraction();
      openSettings(this, { onTrayPositionChange: (position) => board.setTrayPosition(position) });
    });
    const title = this.add.text(0, 0, source.title, {
      fontFamily: 'system-ui', fontSize: '34px', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const progress = this.add.text(0, 0, '', {
      fontFamily: 'system-ui', fontSize: '17px',
    }).setOrigin(0, 0.5);
    styleWithTheme(title, (colors) => {
      title.setColor(colors.text);
      progress.setColor(colors.mutedText);
    });
    const layoutHeader = () => {
      const { width } = this.scale.gameSize;
      const { narrow, buttonY } = puzzleHeader(width);
      const stacked = !narrow && width < 700;
      const centerY = narrow ? 87 : buttonY + backButton.height / 2;
      backButton.setY(buttonY);
      settings.layout(width);
      title.setFontSize(narrow || stacked ? 20 : 34)
        .setPosition(narrow ? headerInset : backButton.x + backButton.width + headerGap, centerY - (stacked ? 10 : 0));
      progress.setFontSize(narrow || stacked ? 15 : 17)
        .setPosition(stacked ? title.x : title.x + title.width + headerControlGap, centerY + (stacked ? 11 : 0));
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, layoutHeader);
    layoutHeader();
    const updateProgress = () => {
      progress.setText(`${puzzle.placedCount} of ${puzzle.pieces.length} placed`);
    };
    const onPlacement = () => {
      updateProgress();
      if (puzzle.isComplete) {
        gameSave.completeAttempt(source.scene.key, { setup, completedAt: new Date().toISOString() });
      } else {
        gameSave.saveProgress(source.scene.key, { setup, placedPieceIds: puzzle.snapshotPlacements() });
      }
    };
    const { trayPosition = 'Auto', trayFractions } = gameSave.settings;
    const board = new PuzzleBoardView(this, puzzle, capture, trayPieceSize, {
      position: trayPosition,
      fractions: trayFractions,
      onResize: (fractions) => gameSave.updateSettings({ trayFractions: fractions }),
    }, onPlacement);
    updateProgress();
    capture.start();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layoutHeader);
      board.destroy();
      capture.destroy();
    });
  }
}
