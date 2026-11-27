import type Phaser from 'phaser';
import { Bounds, type Point } from '../domain/geometry';
import type { PuzzlePiece } from '../domain/Puzzle';
import { drawEffectImage, traceEffectPath } from './effectImage';

const highlightPadding = 4;

function drawPlacementHighlight(context: CanvasRenderingContext2D, outlines: readonly (readonly Point[])[]) {
  context.beginPath();
  for (const points of outlines) {
    traceEffectPath(context, points);
    context.closePath();
  }
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
    if (joinedSeams.length > 0) this.playEdgeFade([piece.outline.points]);
    else this.playSettle(piece);
  }

  playGroup(pieces: readonly PuzzlePiece[]) {
    this.playEdgeFade(pieces.map(({ outline }) => outline.points));
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
      drawPlacementHighlight(context, [outline.points]);
    });
    const settledScale = pulse.scale;
    pulse.setScale(settledScale * 1.12);
    this.animate({
      targets: pulse,
      scale: { value: settledScale, duration: 190, ease: 'Back.Out' },
      alpha: { value: 0, duration: 340, ease: 'Sine.In' },
    });
  }

  private playEdgeFade(outlines: readonly (readonly Point[])[]) {
    const bounds = Bounds.around(outlines.flat());
    const highlight = drawEffectImage(this.scene, bounds, highlightPadding, bounds.center, (context) => {
      drawPlacementHighlight(context, outlines);
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
