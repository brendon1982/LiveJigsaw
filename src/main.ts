import Phaser from 'phaser';
import RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { puzzleSources } from './puzzles/catalog';
import { PlayPuzzleScene } from './ui/PlayPuzzleScene';
import { SelectPuzzleScene } from './ui/SelectPuzzleScene';
import { SettingsScene } from './ui/SettingsScene';
import { onThemeChange, palette } from './ui/theme';
import './style.css';

const gameRoot = document.querySelector<HTMLElement>('#game')!;
const startupLoading = document.getElementById('startup-loading');
const [seed] = crypto.getRandomValues(new Uint32Array(1));

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: gameRoot,
  seed: [String(seed)],
  width: '100%',
  height: '100%',
  roundPixels: true,
  backgroundColor: palette.background,
  scale: { mode: Phaser.Scale.RESIZE },
  input: { activePointers: 2 },
  disableContextMenu: true,
  plugins: { scene: [{ key: 'rexUI', plugin: RexUIPlugin, mapping: 'rexUI' }] },
  scene: [SelectPuzzleScene, PlayPuzzleScene, SettingsScene, ...puzzleSources.map(({ scene }) => scene)],
});

function dismissStartupLoading() {
  if (!game.scene.isActive(SelectPuzzleScene.key)) return;

  startupLoading?.remove();
  game.events.off(Phaser.Core.Events.POST_RENDER, dismissStartupLoading);
}

if (startupLoading) game.events.on(Phaser.Core.Events.POST_RENDER, dismissStartupLoading);

game.events.once(Phaser.Core.Events.DESTROY, onThemeChange((colors) => {
  game.config.backgroundColor.setFromRGB(Phaser.Display.Color.IntegerToRGB(colors.background));
}));
