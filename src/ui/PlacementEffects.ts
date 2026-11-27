import type Phaser from 'phaser';
import { Bounds, type Point } from '../domain/geometry';
import type { PuzzlePiece } from '../domain/Puzzle';
import { drawEffectImage, traceEffectPath } from './effectImage';

const highlightPadding = 4;

function strokePlacementHighlight(context: CanvasRenderingContext2D) {
  context.lineWidth = 7;
  context.strokeStyle = 'rgba(66, 36, 16, 0.6)';
  context.stroke();
  context.lineWidth = 4.5;
  context.strokeStyle = '#ffc76b';
  context.stroke();
  context.lineWidth = 2;
  context.strokeStyle = '#fff6dc';
  context.stroke();
}

export class PlacementEffects {
  private readonly active = new Map<Phaser.GameObjects.GameObject, Phaser.Tweens.Tween>();

  constructor(private readonly scene: Phaser.Scene, private readonly boardLayer: Phaser.GameObjects.Layer) {}

  play(piece: PuzzlePiece, joinedSeams: readonly (readonly Point[])[]) {
    this.playSettle(piece);
    if (joinedSeams.length > 0) this.playEdgeFade(joinedSeams);
  }

  playGroup(pieces: readonly PuzzlePiece[]) {
    for (const piece of pieces) this.playSettle(piece);
    this.playEdgeFade(pieces.map(({ outline }) => outline.points), true);
  }

  destroy() {
    for (const [object, tween] of this.active) {
      tween.remove();
      object.destroy();
    }
    this.active.clear();
  }

  private playSettle(piece: PuzzlePiece) {
    const { outline, target } = piece;
    const pulse = drawEffectImage(this.scene, outline.frame, highlightPadding, target, (context) => {
      context.beginPath();
      traceEffectPath(context, outline.points);
      context.closePath();
      strokePlacementHighlight(context);
    });
    const settledScale = pulse.scale;
    pulse.setScale(settledScale * 1.12);
    this.animate({
      targets: pulse,
      scale: { value: settledScale, duration: 190, ease: 'Back.Out' },
      alpha: { value: 0, duration: 340, ease: 'Sine.In' },
    });
  }

  private playEdgeFade(paths: readonly (readonly Point[])[], closed = false) {
    const bounds = Bounds.around(paths.flat());
    const highlight = drawEffectImage(this.scene, bounds, highlightPadding, bounds.center, (context) => {
      context.beginPath();
      for (const points of paths) {
        traceEffectPath(context, points);
        if (closed) context.closePath();
      }
      strokePlacementHighlight(context);
    }).setName('Placement edge highlight');
    this.animate({ targets: highlight, alpha: 0, duration: 380, ease: 'Sine.In' });
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
