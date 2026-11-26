import Phaser from 'phaser';
import { availablePuzzleSizes } from '../domain/puzzleSizes';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { addPressFeedback, type UIScene } from './button';
import { headerControlGap, puzzleSpacing } from './puzzleHeader';
import { palette, styleWithTheme } from './theme';

export const maxPickerCardWidth = 560;
const previewSize = { width: 1024, height: 576 };
const previewHeight = maxPickerCardWidth * previewSize.height / previewSize.width;
const cornerRadius = 16;
const footerHeight = 72;
const statusRowHeight = 22;
const footerInset = puzzleSpacing;

export function makePreviewCornerCutout(scene: UIScene): Phaser.Textures.CanvasTexture {
  const cutout = scene.textures.createCanvas('picker-preview-corners', maxPickerCardWidth, cornerRadius);
  if (!cutout) throw new Error('Could not create the picker preview corner mask');
  const { context } = cutout;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, cornerRadius, cornerRadius);
  context.fillRect(maxPickerCardWidth - cornerRadius, 0, cornerRadius, cornerRadius);
  context.globalCompositeOperation = 'destination-out';
  context.beginPath();
  context.roundRect(0, 0, maxPickerCardWidth, previewHeight, [cornerRadius, cornerRadius, 0, 0]);
  context.fill();
  cutout.refresh();
  return cutout;
}

export function makePuzzlePickerCard(
  scene: UIScene,
  source: PuzzleSource,
  status: string,
  cutout: Phaser.Textures.CanvasTexture,
  listBounds: Phaser.Geom.Rectangle,
  scrollThreshold: number,
  openOptions: () => void,
) {
  const background = scene.rexUI.add.roundRectangle(0, 0, 1, 1, cornerRadius).setOrigin(0);
  let preview: Phaser.GameObjects.RenderTexture | undefined;
  let previewRequested = false;
  const metadata = `${source.tags.theme} · ${source.tags.type}`;
  const title = scene.add.text(0, 0, source.title, { fontFamily: 'system-ui', fontSize: '22px' }).setOrigin(0, 0.5);
  const metadataStyle = { fontFamily: 'system-ui', fontSize: '15px' };
  const tags = scene.add.text(0, 0, metadata, metadataStyle).setOrigin(0, 0.5);
  const statusLabel = scene.add.text(0, 0, status, metadataStyle).setOrigin(1, 0.5);
  const inlineStatusWidth = status ? tags.width + headerControlGap + statusLabel.width : 0;

  let pressed = false;
  styleWithTheme(background, (colors) => {
    background.setFillStyle(pressed ? colors.surfacePressed : colors.surface);
    title.setColor(colors.text);
    tags.setColor(colors.mutedText);
    statusLabel.setColor(colors.text);
  });
  if (availablePuzzleSizes(source.maxViewport).length > 0) {
    const isInsideList = (x: number, y: number) => {
      const point = scene.cameras.main.getWorldPoint(x, y);
      return listBounds.contains(point.x, point.y);
    };
    addPressFeedback(background, (value) => {
      pressed = value;
      background.setFillStyle(pressed ? palette.surfacePressed : palette.surface);
      preview?.setTint(pressed ? 0xececec : 0xffffff);
    }, scrollThreshold, (pointer) => isInsideList(pointer.x, pointer.y));
    scene.rexUI.add.click(background, { threshold: scrollThreshold, clickInterval: 0 })
      .on('click', (_button: unknown, _object: unknown, pointer: Phaser.Input.Pointer) => {
        if (pointer.wasCanceled || pointer.getDistance() >= scrollThreshold
          || !isInsideList(pointer.downX, pointer.downY) || !isInsideList(pointer.x, pointer.y)) return;
        openOptions();
      });
    background.input!.cursor = 'pointer';
  }

  const container = scene.rexUI.add.container(0, 0, 0, 0).setOrigin(0)
    .addLocal([background, title, tags, statusLabel]);
  return {
    container,
    preparePreview() {
      if (preview) return false;
      const image = source.previewImage;
      if (image && !scene.textures.exists(image.key)) {
        if (previewRequested) return false;
        previewRequested = true;
        scene.load.image(image.key, image.url);
        return true;
      }

      preview = makePreview(scene, source, cutout).setTint(pressed ? 0xececec : 0xffffff);
      const scale = container.width / maxPickerCardWidth;
      container.addLocal(preview).setChildLocalScale(preview, scale, scale);
      return false;
    },
    needsStatusRow(width: number) { return inlineStatusWidth > width - 2 * footerInset; },
    layout(width: number, stackStatus: boolean) {
      const scale = width / maxPickerCardWidth;
      const artworkBottom = previewHeight * scale;
      const height = artworkBottom + footerHeight + (stackStatus ? statusRowHeight : 0);
      const right = width - footerInset;
      const textWidth = Math.max(0, right - footerInset);
      const metadataY = artworkBottom + 50;
      container.setSize(width, height);
      background.setRadius(cornerRadius * scale).resize(width, height);
      if (background.input) background.input.hitArea.setSize(width, height);
      if (preview) container.setChildLocalScale(preview, scale, scale);
      fitLabel(title, source.title, textWidth);
      fitLabel(tags, metadata, textWidth);
      fitLabel(statusLabel, status, textWidth);
      container.setChildLocalPosition(title, footerInset, artworkBottom + 23);
      container.setChildLocalPosition(tags, footerInset, metadataY);
      statusLabel.setOrigin(stackStatus ? 0 : 1, 0.5);
      container.setChildLocalPosition(statusLabel, stackStatus ? footerInset : right,
        metadataY + (stackStatus ? statusRowHeight : 0));
    },
  };
}

function fitLabel(label: Phaser.GameObjects.Text, value: string, width: number) {
  const { canvas, context } = label;
  label.style.syncFont(canvas, context);
  if (context.measureText(value).width <= width) {
    label.setText(value);
    return;
  }
  let text = value;
  while (text && context.measureText(`${text}…`).width > width) text = text.slice(0, -1);
  label.setText(text ? `${text}…` : '');
}

function makePreview(scene: UIScene, source: PuzzleSource, cutout: Phaser.Textures.CanvasTexture) {
  const { width, height } = previewSize;
  const sourceScale = Math.min(1, source.maxViewport.width / width, source.maxViewport.height / height);
  const objects = source.drawPreview(scene, { width: width * sourceScale, height: height * sourceScale });
  const artwork = scene.add.container(0, 0, objects).setScale(maxPickerCardWidth / (width * sourceScale));
  const preview = scene.add.renderTexture(0, 0, maxPickerCardWidth, previewHeight).setOrigin(0);
  preview.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  // Capture and round the artwork once. Cards can then scale the finished preview as a single image.
  preview.draw(artwork).erase(cutout.get(), maxPickerCardWidth / 2, cornerRadius / 2).render();
  artwork.destroy();
  return preview;
}
