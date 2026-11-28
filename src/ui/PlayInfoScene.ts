import Phaser from 'phaser';
import { challengeModes, type ChallengeMode } from '../domain/challengeModes';
import { makeButtonLabel, type UIScene } from './button';
import { challengeDescriptions } from './challengeDescriptions';
import { pickerControlDepth, showPickerDialog } from './puzzleOptions';
import { makeScrollableDialogBody, wrapDialogText } from './scrollableDialogBody';
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

export function showChallengeRules(scene: UIScene, mode: Exclude<ChallengeMode, 'none'>, close: () => void) {
  const description = scene.add.text(0, 0, challengeDescriptions[mode], {
    fontFamily: 'system-ui', fontSize: '17px', color: palette.text,
  }).setDepth(pickerControlDepth);
  const content = scene.rexUI.add.sizer({ orientation: 'y' }).add(description);
  const scroll = makeScrollableDialogBody(scene, content, pickerControlDepth);
  showPickerDialog(scene, `${challengeModes[mode].label} challenge`, scroll.body,
    [makeButtonLabel(scene, 'Close', 88, 52, true)], close, {
      responsive: scroll.responsiveLayout(320, (width) => wrapDialogText(description, width)),
    });
}