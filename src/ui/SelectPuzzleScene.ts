import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { availablePuzzleSizes, puzzleSizes } from '../domain/puzzleSizes';
import { puzzleSources } from '../sources/catalog';
import { makeButton, mutedColor, textColor } from './button';

const pickerWidth = 1248;
const pickerHeight = 540;

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
    const viewport = puzzleSizes[0];
    for (const [index, source] of puzzleSources.entries()) {
      const x = 48 + index * 592;
      this.rexUI.add.roundRectangle(x + 280, 324, 560, 392, 16, 0x30453f);
      const scale = Math.min(1, source.maxViewport.width / viewport.width, source.maxViewport.height / viewport.height);
      const objects = source.drawPreview(this, { width: viewport.width * scale, height: viewport.height * scale });
      this.add.container(x + 24, 152, objects).setScale(1 / scale);
      this.add.text(x + 24, 461, source.title, {
        fontFamily: 'system-ui', fontSize: '23px', color: textColor,
      });
      for (const [option, size] of availablePuzzleSizes(source.maxViewport).entries()) {
        makeButton(this, x + 228 + option * 158, 452, `${size.label} · ${size.columns * size.rows}`,
          () => this.scene.start('PlayPuzzle', { source, size }), 150);
      }
    }

    const fitPicker = () => {
      const { width, height } = this.scale.gameSize;
      const zoom = Math.min(1, width / pickerWidth, height / pickerHeight);
      const viewWidth = Math.floor(pickerWidth * zoom);
      const viewHeight = Math.floor(pickerHeight * zoom);
      this.cameras.main.setViewport(
        Math.floor((width - viewWidth) / 2), Math.floor((height - viewHeight) / 2), viewWidth, viewHeight,
      ).setOrigin(0).setZoom(zoom);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, fitPicker);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, fitPicker));
    fitPicker();
  }
}
