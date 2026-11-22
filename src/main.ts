import Phaser from 'phaser';
import { PuzzleScene, puzzleHeight, puzzleWidth } from './PuzzleScene';
import { WindmillScene } from './WindmillScene';
import './style.css';

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: puzzleWidth,
  height: puzzleHeight,
  backgroundColor: '#263a36',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [PuzzleScene, WindmillScene],
});
