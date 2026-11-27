import Phaser from 'phaser';
import type { PuzzleAttribution, PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButtonLabel, type UIScene } from './button';
import { makePreview, makePreviewCornerCutout, maxPickerCardWidth, pickerCardCornerRadius, puzzleCardTags } from './PuzzlePickerCard';
import { pickerControlDepth, pickerDialogInset, showPickerDialog } from './puzzleOptions';
import { makeScrollableDialogBody } from './scrollableDialogBody';
import { metadataTextStyle, palette } from './theme';

const contentWidth = 326;

export function artworkCreditLines(attribution?: PuzzleAttribution) {
  if (!attribution) return [];
  const { name, description, sourceUrl, artistUrl } = attribution;
  return [name, description, sourceUrl, artistUrl].map((value) => value?.trim() ?? '').filter(Boolean);
}

export function makeDetailsArtwork(scene: UIScene, source: PuzzleSource) {
  const artwork = scene.add.image(0, 0, '__DEFAULT');
  const draw = () => {
    const cutout = makePreviewCornerCutout(scene);
    const preview = makePreview(scene, source, cutout).setVisible(false);
    const { displayWidth, displayHeight } = artwork;
    artwork.texture = preview.texture;
    artwork.setFrame(preview.texture.get().name).setDisplaySize(displayWidth, displayHeight);
    scene.rexUI.getParentSizer(artwork)?.resetChildScaleState(artwork);
    artwork.once('destroy', () => {
      preview.destroy();
      scene.textures.remove(cutout);
    });
  };
  const image = source.previewImage;
  if (image && !scene.textures.exists(image.key)) {
    const loaded = `filecomplete-image-${image.key}`;
    scene.load.once(loaded, draw);
    artwork.once(Phaser.GameObjects.Events.DESTROY, () => scene.load.off(loaded, draw));
    scene.load.image(image.key, image.url);
    scene.load.start();
  } else {
    draw();
  }
  return artwork;
}

export function showPuzzleDetails(
  scene: UIScene, source: PuzzleSource, status: string, artwork: Phaser.GameObjects.Image, onClose: () => void,
) {
  const content = scene.rexUI.add.sizer({ orientation: 'y', width: contentWidth, space: { item: 8 } });

  const addLine = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle, top = 0) => {
    const label = scene.add.text(0, 0, text, {
      ...style, wordWrap: { width: contentWidth, useAdvancedWrap: true },
    }).setDepth(pickerControlDepth);
    content.add(label, { align: 'left', padding: { top } });
  };
  addLine(source.title, { fontFamily: 'system-ui', fontSize: '22px', fontStyle: 'bold', color: palette.text });
  addLine(`${puzzleCardTags(source)} · ${source.motion}`, { ...metadataTextStyle, color: palette.mutedText });

  const credits = artworkCreditLines(source.attribution);
  if (credits.length) {
    addLine('Artwork credits', { ...metadataTextStyle, color: palette.mutedText }, 4);
    for (const credit of credits) addLine(credit, { ...metadataTextStyle, fontSize: '17px', color: palette.text });
  }

  const artworkWidth = contentWidth + 2 * pickerDialogInset;
  artwork.setDisplaySize(artworkWidth, artworkWidth * 9 / 16);
  const cornerRadius = pickerCardCornerRadius * artworkWidth / maxPickerCardWidth;
  const progressLabel = status ? scene.add.text(0, 0, status, { ...metadataTextStyle, color: palette.text }) : undefined;
  const scroll = makeScrollableDialogBody(scene, content, pickerControlDepth, false);
  return showPickerDialog(scene, { artwork, cornerRadius }, scroll.body,
    [makeButtonLabel(scene, 'Close', 88, 52, true)], onClose, {
      footerLabel: progressLabel, fitContent: scroll.fitContent,
    });
}