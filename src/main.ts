import Phaser from 'phaser';
import RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { LighthouseScene } from './LighthouseScene';
import { PlayPuzzleScene, puzzleHeight, puzzleWidth } from './PlayPuzzleScene';
import { SelectPuzzleScene } from './SelectPuzzleScene';
import { WindmillScene } from './WindmillScene';
import './style.css';

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: puzzleWidth,
  height: puzzleHeight,
  backgroundColor: '#263a36',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  plugins: { scene: [{ key: 'rexUI', plugin: RexUIPlugin, mapping: 'rexUI' }] },
  scene: [SelectPuzzleScene, PlayPuzzleScene, WindmillScene, LighthouseScene],
});
