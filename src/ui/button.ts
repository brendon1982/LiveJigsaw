import type Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { hasTouchTargets } from './touchLayout';

export type UIScene = Phaser.Scene & { rexUI: RexUIPlugin };

export const textColor = '#edf3e9';
export const mutedColor = '#bacdc1';

export function makeButton(
  scene: UIScene, x: number, y: number, text: string, click: (pointer: Phaser.Input.Pointer) => void,
  width = 0, dragThreshold?: number,
) {
  const background = scene.rexUI.add.roundRectangle(0, 0, 1, 1, 9, 0x3a514b);
  const caption = scene.add.text(0, 0, text, {
    fontFamily: 'system-ui', fontSize: '17px', color: textColor,
  });
  const button = scene.rexUI.add.label({
    x, y, width, height: hasTouchTargets() ? 54 : 42, align: 'center', background, text: caption,
    space: { left: 16, right: 16 },
  }).setOrigin(0).layout();
  scene.rexUI.add.click(button, { threshold: dragThreshold })
    .on('click', (_button: unknown, _object: unknown, pointer: Phaser.Input.Pointer) => click(pointer));
  button.input!.cursor = 'pointer';
  button.on('pointerover', () => background.setFillStyle(0x4b655b));
  button.on('pointerout', () => background.setFillStyle(0x3a514b));
  return button;
}
