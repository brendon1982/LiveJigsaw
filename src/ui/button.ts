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
  const button = makeButtonLabel(scene, text, width, hasTouchTargets() ? 54 : 42)
    .setPosition(x, y).setOrigin(0).layout();
  scene.rexUI.add.click(button, { threshold: dragThreshold })
    .on('click', (_button: unknown, _object: unknown, pointer: Phaser.Input.Pointer) => click(pointer));
  button.input!.cursor = 'pointer';
  return button;
}

export function makeButtonLabel(scene: UIScene, text: string, width: number, height: number, primary = false) {
  const fill = primary ? 0xc7e1d1 : 0x3a514b;
  const hover = primary ? 0xdff1e7 : 0x4b655b;
  const background = scene.rexUI.add.roundRectangle(0, 0, 1, 1, 9, fill);
  const caption = scene.add.text(0, 0, text, {
    fontFamily: 'system-ui', fontSize: '17px', color: primary ? '#192e28' : textColor,
  });
  const button = scene.rexUI.add.label({
    width, height, align: 'center', background, text: caption,
    space: { left: 16, right: 16 },
  });
  button.on('pointerover', () => background.setFillStyle(hover));
  button.on('pointerout', () => background.setFillStyle(fill));
  return button;
}
