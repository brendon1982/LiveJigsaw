import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { classicBoard } from '../domain/classicPuzzle';
import { puzzleSources } from '../sources/catalog';
import { makeButton, mutedColor, textColor } from './button';

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

    // TODO: Add pagination or scrolling when the catalog outgrows the two cards.
    const viewport = classicBoard.size;
    for (const [index, source] of puzzleSources.entries()) {
      const x = 48 + index * 592;
      this.rexUI.add.roundRectangle(x + 280, 324, 560, 392, 16, 0x30453f);
      const objects = source.drawPreview(this, viewport);
      this.add.container(x + 24, 152, objects);
      makeButton(this, x + 24, 452, source.title, () => this.scene.start('PlayPuzzle', source), viewport.width);
    }
  }
}
