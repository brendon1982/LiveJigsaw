import Phaser from 'phaser';
import type { makePuzzlePickerCard } from './PuzzlePickerCard';
import { isNearCardViewport } from './puzzleCardPanel';
import { puzzleSpacing } from './puzzleHeader';

type Card = ReturnType<typeof makePuzzlePickerCard>;

export function makePickerPreviews(scene: Phaser.Scene, bounds: Phaser.Geom.Rectangle, cards: () => Iterable<Card>) {
  const requested = new Set<string>();
  const ready: Card[] = [];
  let needsDiscovery = true;
  let firstFrameRendered = false;
  const invalidate = () => { needsDiscovery = true; };
  const allowDrawing = () => { firstFrameRendered = true; };
  scene.events.once(Phaser.Scenes.Events.RENDER, allowDrawing);
  scene.load.on(Phaser.Loader.Events.FILE_COMPLETE, invalidate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.RENDER, allowDrawing);
    scene.load.off(Phaser.Loader.Events.FILE_COMPLETE, invalidate);
  });

  const discover = () => {
    needsDiscovery = false;
    ready.length = 0;
    const buffered: Card[] = [];
    let queuedImages = false;
    for (const card of cards()) {
      const { container, previewImage } = card;
      if (card.hasPreview || (!card.previewInUse && !isNearCardViewport(container, bounds, puzzleSpacing))) continue;
      if (previewImage && !scene.textures.exists(previewImage.key)) {
        if (requested.has(previewImage.key)) continue;
        requested.add(previewImage.key);
        scene.load.image(previewImage.key, previewImage.url);
        queuedImages = true;
      } else if (card.previewInUse || (container.y + container.height > bounds.top && container.y < bounds.bottom)) {
        ready.push(card);
      } else {
        buffered.push(card);
      }
    }
    ready.push(...buffered);
    if (queuedImages) scene.load.start();
  };

  return {
    invalidate,
    update() {
      if (!firstFrameRendered) return false;
      if (needsDiscovery) discover();
      const card = ready.shift();
      card?.drawPreview();
      return card !== undefined;
    },
  };
}