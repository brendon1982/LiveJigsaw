import Phaser from 'phaser';
import RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { puzzleSources } from './sources/catalog';
import { PlayPuzzleScene } from './ui/PlayPuzzleScene';
import { SelectPuzzleScene } from './ui/SelectPuzzleScene';
import './style.css';

const gameRoot = document.querySelector<HTMLElement>('#game')!;

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: gameRoot,
  width: '100%',
  height: '100%',
  backgroundColor: '#263a36',
  scale: { mode: Phaser.Scale.RESIZE },
  input: { activePointers: 2 },
  plugins: { scene: [{ key: 'rexUI', plugin: RexUIPlugin, mapping: 'rexUI' }] },
  scene: [SelectPuzzleScene, PlayPuzzleScene, ...puzzleSources.map(({ scene }) => scene)],
});
