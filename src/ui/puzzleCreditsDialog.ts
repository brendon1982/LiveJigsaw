import type Phaser from 'phaser';
import type { PuzzleAttribution } from '../puzzles/PuzzleSource';
import { makeButtonLabel, type UIScene } from './button';
import { pickerControlDepth, showPickerDialog, type PickerDialogTitle } from './puzzleOptions';
import { palette } from './theme';

export const pickerInfoContentWidth = 326;

export function artworkCreditLines(attribution?: PuzzleAttribution) {
  if (!attribution) return [];
  const { name, description, sourceUrl, artistUrl } = attribution;
  return [name, description, sourceUrl, artistUrl].map((value) => value?.trim() ?? '').filter(Boolean);
}

export function showArtworkCredits(scene: UIScene, credits: readonly string[], onClose: () => void) {
  const content = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 8 } });
  addArtworkCreditText(scene, content, credits);
  return showScrollablePickerInfo(scene, 'Artwork credits', content, onClose);
}

type InfoContent = ReturnType<UIScene['rexUI']['add']['sizer']>;

export function addArtworkCreditText(scene: UIScene, content: InfoContent, credits: readonly string[]) {
  for (const credit of credits) {
    const text = scene.add.text(0, 0, credit, {
      fontFamily: 'system-ui', fontSize: '17px', color: palette.text,
      wordWrap: { width: pickerInfoContentWidth, useAdvancedWrap: true },
    }).setDepth(pickerControlDepth);
    content.add(text, { align: 'left' });
  }
}

export function showScrollablePickerInfo(
  scene: UIScene, title: PickerDialogTitle, content: InfoContent, onClose: () => void,
  footerLabel?: Phaser.GameObjects.Text,
) {
  const fullHeight = content.layout().height;
  const body = scene.rexUI.add.scrollablePanel({
    width: pickerInfoContentWidth, height: fullHeight,
    panel: { child: content, mask: { maskType: 'stencil' } },
    clampChildOY: true,
    scrollDetectionMode: 'rectBounds',
    scroller: { threshold: 10 },
    mouseWheelScroller: { focus: 2, speed: 0.75 },
  }).setDepth(pickerControlDepth);

  return showPickerDialog(scene, title, body, [makeButtonLabel(scene, 'Done', 88, 52, true)], onClose, {
    footerLabel,
    fitContent: (height) => {
      const offset = body.childOY;
      body.setMinSize(pickerInfoContentWidth, Math.min(fullHeight, height)).layout().setChildOY(offset, true);
    },
  });
}