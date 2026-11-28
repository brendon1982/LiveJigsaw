import Phaser from 'phaser';
import type { PuzzleAttribution, PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButtonLabel, type UIScene } from './button';
import { makePreview, makePreviewCornerCutout, maxPickerCardWidth, pickerCardCornerRadius, puzzleCardTags } from './PuzzlePickerCard';
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
    setArtworkBannerTexture(scene, artwork, preview.texture);
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
  const header = makeArtworkHeader(scene, artwork);
  const content = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 8 } });
  const labels: Phaser.GameObjects.Text[] = [];

  const addLine = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle, top = 0) => {
    const label = scene.add.text(0, 0, text, style).setDepth(pickerControlDepth);
    labels.push(label);
    content.add(label, { align: 'left', padding: { top } });
  };
  addLine(title, { fontFamily: 'system-ui', fontSize: '22px', fontStyle: 'bold', color: palette.text });
  if (subtitle) addLine(subtitle, { ...metadataTextStyle, color: palette.mutedText });
  if (status) addLine(status, { ...metadataTextStyle, color: palette.text });

  if (credits.length) {
    addLine('Artwork credits', { ...metadataTextStyle, color: palette.mutedText }, 4);
    for (const credit of credits) addLine(credit, { ...metadataTextStyle, fontSize: '17px', color: palette.text });
  }

  const scroll = makeScrollableDialogBody(scene, content, pickerControlDepth);
  return showPickerDialog(scene, header, scroll.body,
    [makeButtonLabel(scene, 'Close', 88, 52, true)], onClose, {
      responsive: scroll.responsiveLayout(342, (width) => {
        for (const label of labels) wrapDialogText(label, width);
      }),
    });
}

type ArtworkBannerTransform = {
  setChildLocalScale: (artwork: Phaser.GameObjects.Image, x: number, y: number) => void;
  setChildLocalPosition: (artwork: Phaser.GameObjects.Image, x: number, y: number) => void;
};

function makeArtworkHeader(scene: UIScene, artwork: Phaser.GameObjects.Image) {
  const view = scene.rexUI.add.sizer().pin(artwork.setOrigin(0.5, 0).setDepth(pickerControlDepth));
  view.addChildrenMap('artwork', artwork);
  return {
    view,
    cornerRadius: (width: number) => pickerCardCornerRadius * width / maxPickerCardWidth,
    reflow(width: number, maxHeight: number) {
      const height = Math.max(1, Math.min(width * 9 / 16, maxHeight));
      view.setMinSize(width, height);
      fitArtworkBanner(view, artwork, width, height);
    },
  };
}

function fitArtworkBanner(view: ArtworkBannerTransform, artwork: Phaser.GameObjects.Image, width: number, height: number) {
  const scale = width / artwork.width;
  const visibleRows = Math.min(artwork.height, height / scale);
  // Crop from the bottom so the preview's rounded top corners stay intact.
  if (visibleRows < artwork.height) artwork.setCrop(0, 0, artwork.width, visibleRows);
  else artwork.setCrop();
  view.setChildLocalScale(artwork, scale, scale);
  view.setChildLocalPosition(artwork, 0, -height / 2);
}

export function setArtworkBannerTexture(scene: UIScene, artwork: Phaser.GameObjects.Image, texture: Phaser.Textures.Texture) {
  artwork.texture = texture;
  artwork.setFrame(texture.get().name);
  const header = scene.rexUI.getParentSizer(artwork);
  if (header) fitArtworkBanner(header, artwork, header.width, header.height);
}