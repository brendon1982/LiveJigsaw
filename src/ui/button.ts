import Phaser from 'phaser';
import type RexUIPlugin from 'phaser4-rex-plugins/templates/ui/ui-plugin.js';
import { palette, styleWithTheme } from './theme';
import { hasTouchTargets } from './touchLayout';

export type UIScene = Phaser.Scene & { rexUI: RexUIPlugin };
type ButtonLabel = ReturnType<UIScene['rexUI']['add']['label']>;
type ButtonBackground = ReturnType<UIScene['rexUI']['add']['roundRectangle']>;

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
  return bindClick(scene, button, click, dragThreshold);
}

export function makeIconButton(
  scene: UIScene,
  name: string,
  drawIcon: (art: Phaser.GameObjects.Graphics, color: number) => void,
  click: (pointer: Phaser.Input.Pointer) => void,
) {
  const size = hasTouchTargets() ? 54 : 42;
  const background = scene.rexUI.add.roundRectangle(0, 0, 1, 1, 9);
  const art = scene.add.graphics();
  const icon = scene.add.container(0, 0, [art]).setSize(24, 24);
  const button = scene.rexUI.add.label({ width: size, height: size, align: 'center', background, icon })
    .setName(name).setOrigin(0).layout();
  styleButton(button, background, (color) => drawIcon(art, Phaser.Display.Color.HexStringToColor(color).color));
  return bindClick(scene, button, click);
}

function bindClick(scene: UIScene, button: ButtonLabel, click: (pointer: Phaser.Input.Pointer) => void, dragThreshold?: number) {
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
  styleButton(button, background, (color) => caption.setColor(color), primary, dragThreshold);
  return button;
}

type OptionTile = {
  name?: string;
  label: string;
  width: number;
  height?: number;
  fontSize?: string;
  drawIcon?: () => Phaser.GameObjects.Container;
  depth?: number;
  contentDepth?: number;
  dragThreshold?: number;
  onClick?: (pointer: Phaser.Input.Pointer) => void;
};

export function makeOptionTile(scene: UIScene, {
  name, label, width, drawIcon, height = drawIcon ? 82 : 52, fontSize = '15px',
  depth = 0, contentDepth = depth, dragThreshold, onClick,
}: OptionTile) {
  const background = scene.rexUI.add.roundRectangle(0, 0, 1, 1, 9).setDepth(depth);
  const text = scene.add.text(0, 0, label, { fontFamily: 'system-ui', fontSize, align: 'center' })
    .setDepth(contentDepth);
  const button = scene.rexUI.add.label({
    name, width, height, orientation: 'y', align: 'center', background, text,
    icon: drawIcon?.().setDepth(contentDepth),
    space: { icon: 4 },
  }).setDepth(depth, true);
  let selected = false;
  let pressed = false;
  const restyle = (colors: typeof palette) => {
    background.setFillStyle(pressed ? colors.buttonPressed : selected ? colors.selectedOption : colors.background)
      .setStrokeStyle(selected ? 2 : 1, selected ? colors.primaryButton : colors.optionBorder);
    text.setColor(colors.text);
  };
  styleWithTheme(button, restyle);
  addPressFeedback(button, (value) => { pressed = value; restyle(palette); }, dragThreshold);
  if (onClick) {
    bindClick(scene, button, (pointer) => { if (!pointer.wasCanceled) onClick(pointer); }, dragThreshold);
  }
  return { button, setSelected(value: boolean) { selected = value; restyle(palette); } };
}

function styleButton(
  button: ButtonLabel, background: ButtonBackground, setContentColor: (color: string) => void,
  primary = false, dragThreshold?: number,
) {
  button.setData('primary', primary);
  let hovered = false;
  let pressed = false;
  const restyle = (colors: typeof palette) => {
    const highlighted = button.getData('primary') === true;
    const fill = highlighted ? colors.primaryButton : colors.button;
    const hover = highlighted ? colors.primaryButtonHover : colors.buttonHover;
    const press = highlighted ? colors.primaryButtonPressed : colors.buttonPressed;
    background.setFillStyle(pressed ? press : hovered ? hover : fill);
    setContentColor(highlighted ? colors.primaryButtonText : colors.text);
  };
  styleWithTheme(button, restyle);
  button.on('changedata-primary', () => restyle(palette));
  button.on('pointerover', (pointer: Phaser.Input.Pointer) => { hovered = !pointer.wasTouch; restyle(palette); });
  button.on('pointerout', () => { hovered = false; restyle(palette); });
  addPressFeedback(button, (value) => { pressed = value; restyle(palette); }, dragThreshold);
}
