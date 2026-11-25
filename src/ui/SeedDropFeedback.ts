import type Phaser from 'phaser';
import type { PuzzlePiece } from '../domain/Puzzle';
import type { UIScene } from './button';
import { drawOutlineEffect } from './effectImage';

export class SeedDropFeedback {
  private readonly toast;
  private cancelPulse?: () => void;

  constructor(
    private readonly scene: UIScene,
    private readonly boardLayer: Phaser.GameObjects.Layer,
    overlay: Phaser.GameObjects.Layer,
  ) {
    this.toast = scene.rexUI.add.toast({
      background: scene.rexUI.add.roundRectangle(0, 0, 0, 0, 10, 0x47252a),
      text: scene.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '15px', color: '#fff1f1' }),
      space: { left: 12, right: 12, top: 8, bottom: 8 },
      duration: { in: 120, hold: 2800, out: 180 },
      transitIn: 'fadeIn',
      transitOut: 'fadeOut',
    });
    this.toast.addToLayer(overlay);
  }

  layout({ width, height }: Phaser.Structs.Size) {
    this.toast.setPosition(width / 2, height - 36);
  }

  show(piece: PuzzlePiece, onPreviewEnd: () => void) {
    this.clearPreview();
    if (!this.toast.isShowingMessage) this.toast.showMessage('Piece must be connected to seed group');

    const pulse = drawOutlineEffect(this.scene, piece, '#771e2a', '#ff5966');
    this.boardLayer.add(pulse);
    const settledScale = pulse.scale;
    pulse.setScale(settledScale * 1.045);
    const tween = this.scene.tweens.add({
      targets: pulse, scale: settledScale, alpha: 0, duration: 320, ease: 'Cubic.Out',
      onComplete: () => {
        this.cancelPulse = undefined;
        pulse.destroy();
        onPreviewEnd();
      },
    });
    this.cancelPulse = () => {
      tween.remove();
      pulse.destroy();
    };
  }

  clearPreview() {
    this.cancelPulse?.();
    this.cancelPulse = undefined;
  }

  destroy() {
    this.clearPreview();
    this.toast.destroy();
  }
}