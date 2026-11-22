import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { newClassicPuzzle } from '../domain/classicPuzzle';
import { LivePuzzleCapture } from '../rendering/LivePuzzleCapture';
import type { PuzzleSource } from '../sources/PuzzleSource';
import { makeButton, mutedColor, textColor } from './button';
import { previewBounds } from './playLayout';
import { PuzzleBoardView } from './PuzzleBoardView';
import { SelectPuzzleScene } from './SelectPuzzleScene';

const views = [
  { key: 'puzzle', label: 'Puzzle', x: 24, width: 100 },
  { key: 'texture', label: 'Dynamic texture', x: 134, width: 170 },
  { key: 'direct', label: 'Direct Phaser', x: 314, width: 152 },
] as const;
type View = typeof views[number]['key'];

export class PlayPuzzleScene extends Phaser.Scene {
  static readonly key = 'PlayPuzzle';
  declare rexUI: RexUIPlugin;

  constructor() {
    super(PlayPuzzleScene.key);
  }

  create(source: PuzzleSource) {
    const puzzle = newClassicPuzzle();
    const capture = new LivePuzzleCapture(this, source, previewBounds);

    makeButton(this, 24, 22, 'All puzzles', () => this.scene.start(SelectPuzzleScene.key), 150);
    this.add.text(196, 19, source.title, {
      fontFamily: 'system-ui', fontSize: '34px', fontStyle: 'bold', color: textColor,
    });
    const helpStyle = { fontFamily: 'system-ui', fontSize: '16px', color: mutedColor };
    const { x, y, width, height } = previewBounds;
    const details = this.add.text(x, y - 28, '', helpStyle);
    const progress = this.add.text(490, 91, '', helpStyle);
    const updateProgress = () => {
      progress.setText(puzzle.isComplete
        ? 'Puzzle complete'
        : `Drag the pieces onto the board. ${puzzle.placedCount} of ${puzzle.pieces.length} placed.`);
    };
    const board = new PuzzleBoardView(this, puzzle, capture, updateProgress);
    updateProgress();

    const texturePreview = this.add.image(x, y, capture.texture.key, '__BASE')
      .setOrigin(0).setDisplaySize(width, height);
    const changeView = (view: View) => {
      const showPuzzle = view === 'puzzle';
      const showTexture = view === 'texture';
      board.setVisible(showPuzzle);
      texturePreview.setVisible(showTexture);
      capture.showDirect(view === 'direct');
      details.setVisible(!showPuzzle).setText(showTexture
        ? `${width} × ${height} display · ${capture.scale}× render target`
        : `${width} × ${height} display · Scene camera`);
      progress.setVisible(showPuzzle);
      for (const [key, button] of buttons) button.setSelected(key === view);
    };
    const buttons = views.map(({ key, label, x, width }) =>
      [key, makeButton(this, x, 76, label, () => changeView(key), width)] as const);
    changeView('puzzle');
    capture.start();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      capture.destroy();
      board.releaseTextures();
    });
  }
}
