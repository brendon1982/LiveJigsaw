import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { puzzles } from './puzzles';
import { makeButton, mutedColor, textColor } from './ui';

export class SelectPuzzleScene extends Phaser.Scene {
  static readonly key = 'SelectPuzzle';
  declare rexUI: RexUIPlugin;

  constructor() {
    super(SelectPuzzleScene.key);
  }

  create() {
    this.add.text(48, 27, 'Live Jigsaw', {
      fontFamily: 'system-ui', fontSize: '44px', fontStyle: 'bold', color: textColor,
    });
    this.add.text(50, 89, 'Choose a live puzzle', {
      fontFamily: 'system-ui', fontSize: '20px', color: mutedColor,
    });

    for (const [index, puzzle] of puzzles.entries()) {
      const x = 48 + index * 592;
      this.rexUI.add.roundRectangle(x + 280, 324, 560, 392, 16, 0x30453f);
      const { objects } = puzzle.drawArtwork(this);
      this.add.container(x + 24, 152, objects);
      makeButton(this, x + 24, 452, puzzle.title, () => this.scene.start('PlayPuzzle', puzzle), 512);
    }
  }
}
