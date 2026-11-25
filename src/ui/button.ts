import type Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { palette, styleWithTheme } from './theme';
import { hasTouchTargets } from './touchLayout';

export type UIScene = Phaser.Scene & { rexUI: RexUIPlugin };

export function addPressFeedback(
  target: Phaser.GameObjects.GameObject,
  setPressed: (pressed: boolean) => void,
  dragThreshold?: number,
  canPress: (pointer: Phaser.Input.Pointer) => boolean = () => true,
) {
  let pressingPointer: Phaser.Input.Pointer | undefined;
  const release = (pointer: Phaser.Input.Pointer) => {
    if (pressingPointer !== pointer) return;
    pressingPointer = undefined;
    setPressed(false);
  };
  target.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (pressingPointer || !pointer.primaryDown || !canPress(pointer)) return;
    pressingPointer = pointer;
    setPressed(true);
  });
  target.on('pointerup', release);
  target.on('pointerout', release);
  target.on('wheel', release);
  if (dragThreshold !== undefined) {
    target.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() >= dragThreshold) release(pointer);
    });
  }
}

export function makeButton(
  scene: UIScene, x: number, y: number, text: string, click: (pointer: Phaser.Input.Pointer) => void,
  width = 0, dragThreshold?: number,
) {
  const button = makeButtonLabel(scene, text, width, hasTouchTargets() ? 54 : 42, false, dragThreshold)
    .setPosition(x, y).setOrigin(0).layout();
  scene.rexUI.add.click(button, { threshold: dragThreshold })
    .on('click', (_button: unknown, _object: unknown, pointer: Phaser.Input.Pointer) => click(pointer));
  button.input!.cursor = 'pointer';
  return button;
}

export function makeButtonLabel(
  scene: UIScene, text: string, width: number, height: number, primary = false, dragThreshold?: number,
) {
  const background = scene.rexUI.add.roundRectangle(0, 0, 1, 1, 9);
  const caption = scene.add.text(0, 0, text, {
    fontFamily: 'system-ui', fontSize: '17px',
  });
  const button = scene.rexUI.add.label({
    width, height, align: 'center', background, text: caption,
    space: { left: 16, right: 16 },
  });
  let hovered = false;
  let pressed = false;
  const restyle = (colors: typeof palette) => {
    const highlighted = primary || button.data?.get('selected') === true;
    const fill = highlighted ? colors.primaryButton : colors.button;
    const hover = highlighted ? colors.primaryButtonHover : colors.buttonHover;
    const press = highlighted ? colors.primaryButtonPressed : colors.buttonPressed;
    background.setFillStyle(pressed ? press : hovered ? hover : fill);
    caption.setColor(highlighted ? colors.primaryButtonText : colors.text);
  };
  styleWithTheme(button, restyle);
  button.on('changedata-selected', () => restyle(palette));
  button.on('pointerover', (pointer: Phaser.Input.Pointer) => { hovered = !pointer.wasTouch; restyle(palette); });
  button.on('pointerout', () => { hovered = false; restyle(palette); });
  addPressFeedback(button, (value) => { pressed = value; restyle(palette); }, dragThreshold);
  return button;
}
