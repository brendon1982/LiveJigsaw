import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { availablePuzzleSizes, puzzleSizes } from '../domain/puzzleSizes';
import { puzzleSources } from '../puzzles/catalog';
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
    const viewport = puzzleSizes[0];
    const cards = puzzleSources.map((source) => {
      const background = this.rexUI.add.roundRectangle(0, 0, 560, 392, 16, 0x30453f);
      const scale = Math.min(1, source.maxViewport.width / viewport.width, source.maxViewport.height / viewport.height);
      const objects = source.drawPreview(this, { width: viewport.width * scale, height: viewport.height * scale });
      const art = this.add.container(0, 0, objects).setScale(1 / scale);
      const title = this.add.text(0, 0, source.title, {
        fontFamily: 'system-ui', fontSize: '23px', color: textColor,
      });
      const buttons = availablePuzzleSizes(source.maxViewport).map((size) =>
        makeButton(this, 0, 0, `${size.label} · ${size.columns * size.rows}`,
          () => this.scene.start('PlayPuzzle', { source, size }), 150));
      return { background, art, title, buttons };
    });

    const fitPicker = () => {
      const { width, height } = this.scale.gameSize;
      const portrait = height > width;
      const pickerWidth = portrait ? 656 : 1248;
      const pickerHeight = portrait ? 960 : 540;
      for (const [index, { background, art, title, buttons }] of cards.entries()) {
        const x = portrait ? 48 : 48 + index * 592;
        const y = portrait ? 128 + index * 408 : 128;
        background.setPosition(x + 280, y + 196);
        art.setPosition(x + 24, y + 24);
        title.setPosition(x + 24, y + 333);
        buttons.forEach((button, option) => button.setPosition(x + 228 + option * 158, y + 324));
      }
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
