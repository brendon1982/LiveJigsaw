import Phaser from 'phaser';
import type { PuzzleSource } from '../puzzles/PuzzleSource';
import { puzzleSizeChoices } from '../puzzles/puzzleSizeChoices';
import { addPressFeedback, type UIScene } from './button';
import { headerControlGap, puzzleSpacing } from './puzzleHeader';
import { metadataTextStyle, palette, styleWithTheme } from './theme';

export const maxPickerCardWidth = 560;
const previewSize = { width: 1024, height: 576 };
const previewHeight = maxPickerCardWidth * previewSize.height / previewSize.width;
export const pickerCardCornerRadius = 16;
const footerHeight = 72;
const statusRowHeight = 22;
const footerInset = puzzleSpacing;
const compactFooterInset = 12;
const creditsWidth = 72;
const footerActionHeight = 44;
const moreWidth = 44;
const compactFooterWidth = 224;
const creditsRowHeight = 36;

export function puzzleCardTags(source: PuzzleSource) {
  return `${source.tags.theme} · ${source.tags.type}`;
}

export function makePreviewCornerCutout(scene: UIScene): Phaser.Textures.CanvasTexture {
  const cornerRadius = pickerCardCornerRadius;
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
  openMore: (copyPreview: () => Phaser.GameObjects.Image) => void,
  openCredits?: () => void,
) {
  const background = scene.rexUI.add.roundRectangle(0, 0, 1, 1, pickerCardCornerRadius).setOrigin(0);
  let preview: Phaser.GameObjects.RenderTexture | undefined;
  let previewRequested = false;
  let compact = false;
  const metadata = puzzleCardTags(source);
  const title = scene.add.text(0, 0, source.title, {
    fontFamily: 'system-ui', fontSize: '22px', fontStyle: 'bold',
  }).setOrigin(0, 0.5);
  const tags = scene.add.text(0, 0, metadata, metadataTextStyle).setOrigin(0, 0.5);
  const statusLabel = scene.add.text(0, 0, status, metadataTextStyle).setOrigin(1, 0.5);
  const inlineStatusWidth = status ? tags.width + headerControlGap + statusLabel.width : 0;

  const isInsideList = (x: number, y: number) => {
    const point = scene.cameras.main.getWorldPoint(x, y);
    return listBounds.contains(point.x, point.y);
  };
  const bindTap = (target: Phaser.GameObjects.GameObject, action: () => void) => {
    scene.rexUI.add.click(target, { threshold: scrollThreshold, clickInterval: 0 })
      .on('click', (_button: unknown, _object: unknown, pointer: Phaser.Input.Pointer) => {
        if (pointer.wasCanceled || pointer.getDistance() >= scrollThreshold
          || !isInsideList(pointer.downX, pointer.downY) || !isInsideList(pointer.x, pointer.y)) return;
        action();
      });
    target.input!.cursor = 'pointer';
  };

  let pressed = false;
  styleWithTheme(background, (colors) => {
    background.setFillStyle(pressed ? colors.surfacePressed : colors.surface);
    title.setColor(colors.text);
    tags.setColor(colors.mutedText);
    statusLabel.setColor(colors.text);
  });
  if (puzzleSizeChoices(source).length > 0) {
    addPressFeedback(background, (value) => {
      pressed = value;
      background.setFillStyle(pressed ? palette.surfacePressed : palette.surface);
      preview?.setTint(pressed ? 0xececec : 0xffffff);
    }, scrollThreshold, (pointer) => isInsideList(pointer.x, pointer.y));
    bindTap(background, openOptions);
  }

  const container = scene.rexUI.add.container(0, 0, 0, 0).setOrigin(0)
    .addLocal([background, title, tags, statusLabel]);
  const makeFooterAction = (name: string, width: number, action: () => void) => {
    const caption = scene.add.text(0, 0, name, metadataTextStyle);
    const button = scene.rexUI.add.label({ width, height: footerActionHeight, align: 'right', text: caption })
      .setName(`picker-${name.toLowerCase()}`).setOrigin(1, 0.5).layout();
    let actionPressed = false;
    const restyle = (colors: typeof palette) => caption.setColor(actionPressed ? colors.text : colors.mutedText);
    styleWithTheme(button, restyle);
    addPressFeedback(button, (value) => { actionPressed = value; restyle(palette); }, scrollThreshold,
      (pointer) => isInsideList(pointer.x, pointer.y));
    bindTap(button, action);
    container.addLocal(button);
    return button;
  };
  function copyPreview() {
    const artwork = scene.add.image(0, 0, preview?.texture ?? '__DEFAULT');
    if (!preview) {
      const usePreviewWhenReady = () => {
        if (!preview) return;
        const { displayWidth, displayHeight } = artwork;
        artwork.texture = preview.texture;
        artwork.setFrame(preview.texture.get().name).setDisplaySize(displayWidth, displayHeight);
        scene.rexUI.getParentSizer(artwork)?.resetChildScaleState(artwork);
        scene.events.off(Phaser.Scenes.Events.UPDATE, usePreviewWhenReady);
      };
      scene.events.on(Phaser.Scenes.Events.UPDATE, usePreviewWhenReady);
      artwork.once('destroy', () => scene.events.off(Phaser.Scenes.Events.UPDATE, usePreviewWhenReady));
    }
    return artwork;
  }
  const more = makeFooterAction('More', moreWidth, () => {
    if (compact) openMore(copyPreview);
  });
  const credits = openCredits && makeFooterAction('Credits', creditsWidth, openCredits);
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
    layout(width: number, stackStatus: boolean, compactLayout: boolean) {
      compact = compactLayout;
      const scale = width / maxPickerCardWidth;
      const artworkBottom = previewHeight * scale;
      const compactFooter = width < compactFooterWidth;
      const stackCredits = credits && compactFooter;
      const height = artworkBottom + (compact ? footerActionHeight
        : footerHeight + (stackStatus ? statusRowHeight : 0) + (stackCredits ? creditsRowHeight : 0));
      const inset = compact ? compactFooterInset : footerInset;
      const right = width - inset;
      const textWidth = Math.max(0, right - inset);
      container.setSize(width, height);
      background.setRadius(pickerCardCornerRadius * scale).resize(width, height);
      if (background.input) background.input.hitArea.setSize(width, height);
      if (preview) container.setChildLocalScale(preview, scale, scale);
      title.setFontSize(compact || compactFooter ? 16 : 22);
      container.setChildVisible(more, compact);
      container.setChildVisible(tags, !compact);
      container.setChildVisible(statusLabel, !compact);
      if (credits) container.setChildVisible(credits, !compact);
      if (compact) {
        const titleY = artworkBottom + footerActionHeight / 2;
        fitLabel(title, source.title, Math.max(0, textWidth - moreWidth - headerControlGap));
        container.setChildLocalPosition(title, inset, titleY);
        container.setChildLocalPosition(more, right, titleY);
        return;
      }

      const metadataY = artworkBottom + 50;
      const titleWidth = credits && !stackCredits ? Math.max(0, textWidth - creditsWidth - headerControlGap) : textWidth;
      fitLabel(title, source.title, titleWidth);
      fitLabel(tags, metadata, textWidth);
      fitLabel(statusLabel, status, textWidth);
      container.setChildLocalPosition(title, footerInset, artworkBottom + 23);
      if (credits) container.setChildLocalPosition(credits, right,
        stackCredits ? height - footerActionHeight / 2 : artworkBottom + 23);
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
  preview.draw(artwork).erase(cutout.get(), maxPickerCardWidth / 2, pickerCardCornerRadius / 2).render();
  artwork.destroy();
  return preview;
}
