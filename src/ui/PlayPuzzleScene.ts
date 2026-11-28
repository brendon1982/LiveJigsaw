import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { challengeModes } from '../domain/challengeModes';
import { PuzzlePlay, type PuzzlePlaySnapshot } from '../domain/PuzzlePlay';
import { createPuzzle } from '../domain/puzzleSizes';
import { gameSave } from '../persistence';
import type { PuzzleSetup } from '../persistence/GameSave';
import { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { addPressFeedback } from './button';
import { openPlayInfo, showChallengeRules } from './PlayInfoScene';
import { playWorkspace } from './playLayout';
import { makeDetailsArtwork, showPuzzleDetails } from './puzzleDetailsDialog';
import { headerControlGap, headerInset, makeBackButton, makeSettingsButton, puzzleSpacing } from './puzzleHeader';
import { PuzzleBoardView } from './PuzzleBoardView';
import { showPuzzleLoading } from './puzzleLoading';
import { fitLabel } from './PuzzlePickerCard';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { openSettings } from './SettingsScene';
import { metadataTextStyle, palette, styleWithTheme } from './theme';

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
    let board: PuzzleBoardView | undefined;
    let loading: ReturnType<typeof showPuzzleLoading> | undefined = showPuzzleLoading(this);

    // Explicit scene data prevents Phaser from replaying the filters supplied by Landing.
    const backButton = makeBackButton(this, () => this.scene.start(SelectPuzzleScene.key, {}));
    const settings = makeSettingsButton(this, () => {
      board?.cancelInteraction();
      openSettings(this, {
        onTrayPositionChange: (position) => board?.setTrayPosition(position),
        onAllowLoosePiecesOnBoardChange: (allow) => board?.setAllowLoosePiecesOnBoard(allow),
      });
    });
    const title = this.add.text(0, 0, source.title, {
      fontFamily: 'system-ui', fontSize: '20px', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const progress = this.add.text(0, 0, '', metadataTextStyle).setOrigin(0, 0.5);
    const makeHeaderLink = (name: string, text: string, open: () => void) => {
      const link = this.add.text(0, 0, text, metadataTextStyle).setName(name).setOrigin(0, 0.5);
      this.rexUI.add.click(link, { threshold: 10, clickInterval: 0 })
        .on('click', (_button: unknown, _object: unknown, pointer: Phaser.Input.Pointer) => {
          if (pointer.wasCanceled) return;
          board?.cancelInteraction();
          open();
        });
      link.input!.cursor = 'pointer';
      let pressed = false;
      const restyle = (colors: typeof palette) => link.setColor(pressed ? colors.text : colors.mutedText);
      styleWithTheme(link, restyle);
      addPressFeedback(link, (value) => { pressed = value; restyle(palette); }, 10);
      return link;
    };
    const challengeLabel = challengeMode === 'none' ? '' : `· ${challengeModes[challengeMode].label}`;
    const challenge = challengeMode === 'none' ? undefined : makeHeaderLink('Challenge rules', challengeLabel, () => {
      openPlayInfo(this, (scene, close) => showChallengeRules(scene, challengeMode, close));
    });
    const artistName = source.attribution?.name?.trim();
    const artist = artistName ? makeHeaderLink('Artwork details', `· ${artistName}`, () => {
      openPlayInfo(this, (scene, close) => showPuzzleDetails(scene, source, progress.text, makeDetailsArtwork(scene, source), close));
    }) : undefined;
    styleWithTheme(title, (colors) => {
      title.setColor(colors.text);
      progress.setColor(colors.mutedText);
    });
    const pieceCount = puzzle.pieces.length;
    let headerBottom = 0;
    const workspace = () => playWorkspace(this.scale.gameSize, headerBottom);
    const layoutHeader = () => {
      const { width } = this.scale.gameSize;
      const narrow = width < 620;
      settings.layout(width);

      const titleX = narrow ? headerInset : backButton.x + backButton.width + puzzleSpacing;
      const textRight = narrow ? width - headerInset : settings.button.x - puzzleSpacing;
      fitLabel(title, source.title, textRight - titleX);
      for (const label of [progress, challenge, artist]) label?.setFontSize(narrow ? 14 : 15);
      const textHeight = title.height + progress.height;
      const buttonHeight = Math.max(backButton.height, settings.button.height);
      const rowHeight = Math.max(buttonHeight, textHeight);
      const textTop = narrow ? puzzleSpacing + buttonHeight + headerControlGap
        : puzzleSpacing + (rowHeight - textHeight) / 2;
      const progressY = textTop + title.height + progress.height / 2;
      title.setPosition(titleX, textTop + title.height / 2);
      progress.setPosition(titleX, progressY);
      let linkX = progress.x + progress.width + headerControlGap;
      if (challenge) {
        const artistSpace = artist ? 48 : 0;
        fitLabel(challenge, challengeLabel, textRight - linkX - artistSpace);
        challenge.setPosition(linkX, progressY);
        linkX += challenge.width + headerControlGap;
      }
      if (artist) {
        fitLabel(artist, `· ${artistName}`, textRight - linkX);
        artist.setPosition(linkX, progressY);
      }
      headerBottom = narrow ? textTop + textHeight : puzzleSpacing + rowHeight;
      loading?.layout(workspace());
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
        board?.showCompletion();
        completionAction = this.time.delayedCall(completionPreviewDuration, () => {
          backButton.setData('primary', true);
        });
      } else {
        saveProgress();
      }
    };
    updateProgress();
    capture.start(() => {
      loading?.destroy();
      loading = undefined;
      const { trayPosition = 'Auto', trayFractions, allowLoosePiecesOnBoard } = gameSave.settings;
      board = new PuzzleBoardView(this, play, capture, trayPieceArea, {
        position: trayPosition,
        fractions: trayFractions,
        onResize: (fractions) => gameSave.updateSettings({ trayFractions: fractions }),
      }, { onPlacement, onWorkspaceChange: saveProgress }, allowLoosePiecesOnBoard, workspace);
    }, () => loading?.fail());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layoutHeader);
      completionAction?.remove(false);
      loading?.destroy();
      board?.destroy();
      capture.destroy();
    });
  }
}
