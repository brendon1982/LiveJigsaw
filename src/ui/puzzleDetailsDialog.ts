import type Phaser from 'phaser';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import type { UIScene } from './button';
import { addArtworkCreditText, artworkCreditLines, pickerInfoContentWidth, showScrollablePickerInfo } from './puzzleCreditsDialog';
import { maxPickerCardWidth, pickerCardCornerRadius, puzzleCardTags } from './PuzzlePickerCard';
import { pickerControlDepth, pickerDialogInset } from './puzzleOptions';
import { metadataTextStyle, palette } from './theme';

export function showPuzzleDetails(
  scene: UIScene, source: PuzzleSource, status: string, artwork: Phaser.GameObjects.Image, onClose: () => void,
) {
  const content = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 8 } });

  const addLine = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle, top = 0) => {
    const label = scene.add.text(0, 0, text, {
      ...style, wordWrap: { width: pickerInfoContentWidth, useAdvancedWrap: true },
    }).setDepth(pickerControlDepth);
    content.add(label, { align: 'left', padding: { top } });
  };
  addLine(source.title, { fontFamily: 'system-ui', fontSize: '22px', fontStyle: 'bold', color: palette.text });
  addLine(`${puzzleCardTags(source)} · ${source.motion}`, { ...metadataTextStyle, color: palette.mutedText });

  const credits = artworkCreditLines(source.attribution);
  if (credits.length) {
    addLine('Artwork credits', { ...metadataTextStyle, color: palette.mutedText }, 4);
    addArtworkCreditText(scene, content, credits);
  }

  const artworkWidth = pickerInfoContentWidth + 2 * pickerDialogInset;
  artwork.setDisplaySize(artworkWidth, artworkWidth * 9 / 16);
  const cornerRadius = pickerCardCornerRadius * artworkWidth / maxPickerCardWidth;
  const progressLabel = status ? scene.add.text(0, 0, status, { ...metadataTextStyle, color: palette.text }) : undefined;
  return showScrollablePickerInfo(scene, { artwork, cornerRadius }, content, onClose, progressLabel);
}