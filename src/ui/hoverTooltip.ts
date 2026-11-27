import Phaser from 'phaser';
import type { UIScene } from './button';
import { styleWithTheme } from './theme';

type TooltipTarget = Phaser.GameObjects.GameObject & {
  visible: boolean;
  getBounds(): Phaser.Geom.Rectangle;
};

const hoverDelay = 400;
const gap = 8;

export function makeHoverTooltip(scene: UIScene, { layer, depth = 0 }: {
  layer?: Phaser.GameObjects.Layer; depth?: number;
} = {}) {
  const background = scene.rexUI.add.roundRectangle(0, 0, 1, 1, 6);
  const text = scene.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '14px' });
  const label = scene.rexUI.add.label({
    background, text, space: { left: 10, right: 10, top: 5, bottom: 5 },
  }).setName('Hover tooltip').setOrigin(0).setDepth(depth).setVisible(false);
  if (layer) label.addToLayer(layer);
  styleWithTheme(label, (colors) => {
    background.setFillStyle(colors.background).setStrokeStyle(1, colors.optionBorder);
    text.setColor(colors.text);
  });

  let target: TooltipTarget | undefined;
  let pending: Phaser.Time.TimerEvent | undefined;
  const hide = () => {
    pending?.remove();
    pending = undefined;
    target = undefined;
    if (label.scene) label.setVisible(false);
  };

  const show = (anchor: TooltipTarget, caption: string) => {
    const bounds = anchor.getBounds();
    const { width, height } = scene.scale.gameSize;
    text.setWordWrapWidth(Math.max(1, Math.min(304, width - 2 * gap - 20)), true).setText(caption);
    label.layout();
    const below = bounds.bottom + gap;
    const top = below + label.height <= height - gap ? below : bounds.top - gap - label.height;
    label.setPosition(
      Phaser.Math.Clamp(bounds.centerX - label.width / 2, gap, Math.max(gap, width - gap - label.width)),
      Phaser.Math.Clamp(top, gap, Math.max(gap, height - gap - label.height)),
    ).setVisible(true);
  };

  scene.input.on('pointerdown', hide);
  scene.input.on('wheel', hide);
  scene.input.on('gameout', hide);
  scene.game.events.on(Phaser.Core.Events.BLUR, hide);
  scene.scale.on(Phaser.Scale.Events.RESIZE, hide);
  label.once(Phaser.GameObjects.Events.DESTROY, () => {
    pending?.remove();
    scene.input.off('pointerdown', hide);
    scene.input.off('wheel', hide);
    scene.input.off('gameout', hide);
    scene.game.events.off(Phaser.Core.Events.BLUR, hide);
    scene.scale.off(Phaser.Scale.Events.RESIZE, hide);
  });

  return {
    hide,
    destroy: () => label.destroy(),
    attach(anchor: TooltipTarget, caption: string, canHover: (pointer: Phaser.Input.Pointer) => boolean = () => true) {
      anchor.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        if (pointer.wasTouch || pointer.isDown || !canHover(pointer)) return;
        hide();
        target = anchor;
        pending = scene.time.delayedCall(hoverDelay, () => {
          pending = undefined;
          if (anchor.visible && anchor.input?.enabled && scene.input.enabled && canHover(pointer)) show(anchor, caption);
        });
      });
      const leave = () => { if (target === anchor) hide(); };
      anchor.on('pointerout', leave);
      anchor.on('pointerdown', leave);
      anchor.once(Phaser.GameObjects.Events.DESTROY, leave);
    },
  };
}