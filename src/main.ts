import Phaser from 'phaser';
import RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { puzzleSources } from './sources/catalog';
import { PlayPuzzleScene } from './ui/PlayPuzzleScene';
import { gameHeight, gameWidth } from './ui/playLayout';
import { SelectPuzzleScene } from './ui/SelectPuzzleScene';
import './style.css';

const gameRoot = document.querySelector<HTMLElement>('#game')!;
gameRoot.style.maxWidth = `${gameWidth}px`;
gameRoot.style.maxHeight = `${gameHeight}px`;

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: gameRoot,
  width: gameWidth,
  height: gameHeight,
  backgroundColor: '#263a36',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  plugins: { scene: [{ key: 'rexUI', plugin: RexUIPlugin, mapping: 'rexUI' }] },
  scene: [SelectPuzzleScene, PlayPuzzleScene, ...puzzleSources.map(({ scene }) => scene)],
});
