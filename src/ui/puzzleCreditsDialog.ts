import type { PuzzleAttribution } from '../puzzles/PuzzleSource';
import { makeButtonLabel, type UIScene } from './button';
import { pickerControlDepth, showPickerDialog } from './puzzleOptions';
import { palette } from './theme';

const contentWidth = 326;

export function artworkCreditLines(attribution?: PuzzleAttribution) {
  if (!attribution) return [];
  const { name, description, sourceUrl, artistUrl } = attribution;
  return [name, description, sourceUrl, artistUrl].map((value) => value?.trim() ?? '').filter(Boolean);
}

export function showArtworkCredits(scene: UIScene, credits: readonly string[], onClose: () => void) {
  const content = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 8 } });
  for (const credit of credits) {
    const text = scene.add.text(0, 0, credit, {
      fontFamily: 'system-ui', fontSize: '17px', color: palette.text,
      wordWrap: { width: contentWidth, useAdvancedWrap: true },
    }).setDepth(pickerControlDepth);
    content.add(text, { align: 'left' });
  }

  const fullHeight = content.layout().height;
  const body = scene.rexUI.add.scrollablePanel({
    width: contentWidth, height: fullHeight,
    panel: { child: content, mask: { maskType: 'stencil' } },
    clampChildOY: true,
    scrollDetectionMode: 'rectBounds',
    scroller: { threshold: 10 },
    mouseWheelScroller: { focus: 2, speed: 0.75 },
  }).setDepth(pickerControlDepth);

  return showPickerDialog(scene, 'Artwork credits', body, [makeButtonLabel(scene, 'Done', 88, 52, true)], onClose, {
    fitContent: (height) => {
      const offset = body.childOY;
      body.setMinSize(contentWidth, Math.min(fullHeight, height)).layout().setChildOY(offset, true);
    },
  });
}