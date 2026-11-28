import Phaser from 'phaser';
import type { PuzzleAttribution, PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButtonLabel, type UIScene } from './button';
import { makePreview, makePreviewCornerCutout, puzzleCardTags } from './PuzzlePickerCard';
import { pickerControlDepth, showPickerDialog } from './puzzleOptions';
import { makeScrollableDialogBody, wrapDialogText } from './scrollableDialogBody';
import { metadataTextStyle, palette } from './theme';

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
  return showArtworkDetails(scene, artwork, onClose, {
    title: source.title,
    subtitle: `${puzzleCardTags(source)} · ${source.motion}`,
    credits: artworkCreditLines(source.attribution),
    status,
  });
}

export function showArtworkDetails(
  scene: UIScene, artwork: Phaser.GameObjects.Image, onClose: () => void,
  { title, subtitle, credits, status }: { title: string; subtitle?: string; credits: readonly string[]; status?: string },
) {
  artwork.setDisplaySize(1, 9 / 16).setDepth(pickerControlDepth);
  const content = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 8 } }).add(artwork);
  const labels: Phaser.GameObjects.Text[] = [];

  const addLine = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle, top = 0) => {
    const label = scene.add.text(0, 0, text, style).setDepth(pickerControlDepth);
    labels.push(label);
    content.add(label, { align: 'left', padding: { top } });
  };
  addLine(title, { fontFamily: 'system-ui', fontSize: '22px', fontStyle: 'bold', color: palette.text });
  if (subtitle) addLine(subtitle, { ...metadataTextStyle, color: palette.mutedText });

  if (credits.length) {
    addLine('Artwork credits', { ...metadataTextStyle, color: palette.mutedText }, 4);
    for (const credit of credits) addLine(credit, { ...metadataTextStyle, fontSize: '17px', color: palette.text });
  }

  const progressLabel = status ? scene.add.text(0, 0, status, { ...metadataTextStyle, color: palette.text }) : undefined;
  const scroll = makeScrollableDialogBody(scene, content, pickerControlDepth);
  return showPickerDialog(scene, undefined, scroll.body,
    [makeButtonLabel(scene, 'Close', 88, 52, true)], onClose, {
      footerLabel: progressLabel,
      responsive: scroll.responsiveLayout(342, (width) => {
        artwork.setDisplaySize(width, width * 9 / 16);
        content.resetChildScaleState(artwork);
        for (const label of labels) wrapDialogText(label, width);
      }),
    });
}