import Phaser from 'phaser';
import { challengeModes, type ChallengeMode } from '../domain/challengeModes';
import { makeButtonLabel, type UIScene } from './button';
import { pickerControlDepth, showPickerDialog } from './puzzleOptions';
import { palette } from './theme';

type ShowInfo = (scene: UIScene, close: () => void) => void;

export function openPlayInfo(owner: UIScene, show: ShowInfo) {
  if (!owner.input.enabled) return;
  owner.input.enabled = false;
  owner.scene.launch(PlayInfoScene.key, { owner, show });
  owner.scene.bringToTop(PlayInfoScene.key);
}

export class PlayInfoScene extends Phaser.Scene {
  static readonly key = 'PlayInfo';
  declare rexUI: UIScene['rexUI'];

  constructor() {
    super(PlayInfoScene.key);
  }

  create({ owner, show }: { owner: UIScene; show: ShowInfo }) {
    const close = () => this.scene.stop();
    owner.events.once(Phaser.Scenes.Events.SHUTDOWN, close);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      owner.events.off(Phaser.Scenes.Events.SHUTDOWN, close);
      owner.input.enabled = true;
    });
    show(this, close);
  }
}

const challengeDescriptions = {
  sequential: 'Only one piece is unlocked at a time. Place it to unlock the next piece. Locked pieces appear in gray.',
  'sequential-window': `Up to ${challengeModes['sequential-window'].trayWindow} pieces are unlocked at a time. Place them in any order; each placement unlocks the next piece. Locked pieces appear in gray.`,
  'no-guide': 'The board has no artwork guide. Use the artwork on the pieces and their shapes to find where they belong.',
  seed: 'Start by placing any piece in its correct spot. After that, each new placement must touch a correctly placed piece along an edge.',
} satisfies Record<Exclude<ChallengeMode, 'none'>, string>;

export function showChallengeRules(scene: UIScene, mode: Exclude<ChallengeMode, 'none'>, close: () => void) {
  const content = scene.add.text(0, 0, challengeDescriptions[mode], {
    fontFamily: 'system-ui', fontSize: '17px', color: palette.text, wordWrap: { width: 304, useAdvancedWrap: true },
  }).setFixedSize(304, 0).setDepth(pickerControlDepth);
  showPickerDialog(scene, `${challengeModes[mode].label} challenge`, content,
    [makeButtonLabel(scene, 'Close', 88, 52, true)], close);
}