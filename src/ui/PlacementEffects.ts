import type Phaser from 'phaser';
import { Bounds, type Point } from '../domain/geometry';
import type { PuzzlePiece } from '../domain/Puzzle';
import { drawEffectImage, traceEffectPath } from './effectImage';

export class PlacementEffects {
  private readonly active = new Map<Phaser.GameObjects.GameObject, Phaser.Tweens.Tween>();

  constructor(private readonly scene: Phaser.Scene, private readonly boardLayer: Phaser.GameObjects.Layer) {}

  play(piece: PuzzlePiece, joinedSeams: readonly (readonly Point[])[]) {
    this.playSettle(piece);
    if (joinedSeams.length > 0) this.playSeamFade(joinedSeams);
  }

  destroy() {
    for (const [object, tween] of this.active) {
      tween.remove();
      object.destroy();
    }
    this.active.clear();
  }

  private playSettle({ target, outline }: PuzzlePiece) {
    const pulse = drawEffectImage(this.scene, outline.frame, 3, target, (context) => {
      context.beginPath();
      traceEffectPath(context, outline.points);
      context.closePath();
      context.lineWidth = 3;
      context.strokeStyle = 'rgba(17, 27, 34, 0.26)';
      context.stroke();
      context.lineWidth = 1.5;
      context.strokeStyle = 'rgba(245, 250, 255, 0.5)';
      context.stroke();
    });
    const settledScale = pulse.scale;
    pulse.setScale(settledScale * 1.045);
    this.animate({ targets: pulse, scale: settledScale, alpha: 0, duration: 280, ease: 'Cubic.Out' });
  }

  private playSeamFade(seams: readonly (readonly Point[])[]) {
    const bounds = Bounds.around(seams.flat());
    const highlight = drawEffectImage(this.scene, bounds, 3, bounds.center, (context) => {
      context.beginPath();
      for (const seam of seams) traceEffectPath(context, seam);
      context.lineWidth = 4;
      context.strokeStyle = 'rgba(215, 241, 255, 0.22)';
      context.stroke();
      context.lineWidth = 1.5;
      context.strokeStyle = 'rgba(245, 250, 255, 0.68)';
      context.stroke();
    });
    this.animate({ targets: highlight, alpha: 0, duration: 300, ease: 'Quad.Out' });
  }

  private animate(animation: Phaser.Types.Tweens.TweenBuilderConfig & { targets: Phaser.GameObjects.GameObject }) {
    const object = animation.targets;
    this.boardLayer.add(object);
    const tween = this.scene.tweens.add({
      ...animation,
      onComplete: () => {
        this.active.delete(object);
        object.destroy();
      },
    });
    this.active.set(object, tween);
  }
}
