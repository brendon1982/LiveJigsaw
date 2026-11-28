import Phaser from 'phaser';
import { creditedArtistName, type PuzzleSource } from '../puzzles/PuzzleSource';
import { hasPuzzleSizeChoice } from '../puzzles/puzzleSizeChoices';
import { addPressFeedback, type UIScene } from './button';
import { headerControlGap, puzzleSpacing } from './puzzleHeader';
import { metadataTextStyle, palette, styleWithTheme } from './theme';

export const maxPickerCardWidth = 560;
const previewSize = { width: 1024, height: 576 };
const previewHeight = maxPickerCardWidth * previewSize.height / previewSize.width;
const landingArtworkBackground = 0xf8f6f0;
export const pickerCardCornerRadius = 16;
const footerHeight = 72;
const statusRowHeight = 22;
const footerInset = puzzleSpacing;
const compactFooterInset = 12;
const footerActionHeight = 44;
const moreWidth = 44;
const compactFooterWidth = 224;
const creditsRowHeight = 36;

export function puzzleCardTags(source: PuzzleSource) {
  return `${source.tags.theme} · ${source.tags.type}`;
}

export function makePreviewCornerCutout(scene: UIScene, corners: 'top' | 'all' = 'top'): Phaser.Textures.CanvasTexture {
  const cornerRadius = pickerCardCornerRadius;
  const allCorners = corners === 'all';
  const cutoutHeight = allCorners ? previewHeight : cornerRadius;
  const cutout = scene.textures.createCanvas(`preview-corners-${corners}`, maxPickerCardWidth, cutoutHeight);
  if (!cutout) throw new Error('Could not create the picker preview corner mask');
  const { context } = cutout;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, maxPickerCardWidth, cutoutHeight);
  context.globalCompositeOperation = 'destination-out';
  context.beginPath();
  context.roundRect(0, 0, maxPickerCardWidth, previewHeight,
    allCorners ? cornerRadius : [cornerRadius, cornerRadius, 0, 0]);
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
  openDetails: (copyPreview: () => Phaser.GameObjects.Image) => void,
  hasCredits: boolean,
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
  if (hasPuzzleSizeChoice(source)) {
    addPressFeedback(background, (value) => {
      pressed = value;
      background.setFillStyle(pressed ? palette.surfacePressed : palette.surface);
      preview?.setTint(pressed ? 0xececec : 0xffffff);
    }, scrollThreshold, (pointer) => isInsideList(pointer.x, pointer.y));
    bindTap(background, openOptions);
  }

  const container = scene.rexUI.add.container(0, 0, 0, 0).setOrigin(0)
    .addLocal([background, title, tags, statusLabel]);
  const makeFooterAction = (name: string, text: string, width: number, action: () => void) => {
    const caption = scene.add.text(0, 0, text, metadataTextStyle);
    const button = scene.rexUI.add.label({ width, height: footerActionHeight, align: 'right', text: caption })
      .setName(`picker-${name}`).setOrigin(1, 0.5).layout();
    let actionPressed = false;
    const restyle = (colors: typeof palette) => caption.setColor(actionPressed ? colors.text : colors.mutedText);
    styleWithTheme(button, restyle);
    addPressFeedback(button, (value) => { actionPressed = value; restyle(palette); }, scrollThreshold,
      (pointer) => isInsideList(pointer.x, pointer.y));
    bindTap(button, action);
    container.addLocal(button);
    return { button, caption };
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
  const { button: more } = makeFooterAction('more', '...', moreWidth, () => {
    if (compact) openDetails(copyPreview);
  });
  const artistName = creditedArtistName(source.attribution) ?? 'Credits';
  const credits = hasCredits && makeFooterAction('credits', artistName, footerActionHeight, () => openDetails(copyPreview));
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
      if (credits) container.setChildVisible(credits.button, !compact);
      if (compact) {
        const titleY = artworkBottom + footerActionHeight / 2;
        fitLabel(title, source.title, Math.max(0, textWidth - moreWidth - headerControlGap));
        container.setChildLocalPosition(title, inset, titleY);
        container.setChildLocalPosition(more, right, titleY);
        return;
      }

      const metadataY = artworkBottom + 50;
      let titleWidth = textWidth;
      if (credits) {
        const { button, caption } = credits;
        fitLabel(caption, artistName, stackCredits ? textWidth : Math.floor(textWidth / 2));
        const buttonWidth = Math.max(footerActionHeight, caption.width);
        button.setMinSize(buttonWidth, footerActionHeight).layout();
        if (button.input) button.input.hitArea.setSize(button.width, button.height);
        container.setChildLocalPosition(button, right,
          stackCredits ? height - footerActionHeight / 2 : artworkBottom + 23);
        if (!stackCredits) titleWidth -= buttonWidth + headerControlGap;
      }
      fitLabel(title, source.title, titleWidth);
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

export function fitLabel(label: Phaser.GameObjects.Text, value: string, width: number) {
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

export function makePreview(scene: UIScene, source: PuzzleSource, cutout: Phaser.Textures.CanvasTexture) {
  const { width, height } = previewSize;
  const sourceScale = Math.min(1, source.maxViewport.width / width, source.maxViewport.height / height);
  const objects = source.drawPreview(scene, { width: width * sourceScale, height: height * sourceScale });
  const artwork = scene.add.container(0, 0, objects).setScale(maxPickerCardWidth / (width * sourceScale));
  return captureCardArtwork(scene, artwork, cutout);
}

export function captureImageArtwork(
  scene: UIScene, key: string, cutout: Phaser.Textures.CanvasTexture,
  focus = { x: 0.5, y: 0.5 },
) {
  const image = scene.add.image(0, 0, key).setOrigin(0);
  image.setScale(Math.max(maxPickerCardWidth / image.width, previewHeight / image.height));
  const cropOrigin = (frameSize: number, imageSize: number, subject: number) =>
    Phaser.Math.Clamp(frameSize / 2 - imageSize * subject, Math.min(0, frameSize - imageSize), 0);
  const left = cropOrigin(maxPickerCardWidth, image.displayWidth, focus.x);
  const top = cropOrigin(previewHeight, image.displayHeight, focus.y);
  image.setPosition(left, top);
  return captureCardArtwork(scene, image, cutout, landingArtworkBackground);
}

export function makeScalableArtwork(scene: UIScene, preview: Phaser.GameObjects.RenderTexture) {
  // RexUI resizes backgrounds during layout, which would clear a RenderTexture.
  const image = scene.add.image(0, 0, preview.removeFromDisplayList().texture);
  image.once(Phaser.GameObjects.Events.DESTROY, () => preview.destroy());
  return image;
}

function captureCardArtwork(
  scene: UIScene, artwork: Phaser.GameObjects.GameObject, cutout: Phaser.Textures.CanvasTexture,
  background?: number,
) {
  // Keep the capture the same size as the artwork and cutout, even with an odd height.
  const preview = new Phaser.GameObjects.RenderTexture(scene, 0, 0, maxPickerCardWidth, previewHeight, false).setOrigin(0);
  scene.add.existing(preview);
  preview.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  // Capture and round the artwork once so cards can scale it as a single image.
  if (background !== undefined) preview.fill(background);
  preview.draw(artwork).erase(cutout.get(), cutout.width / 2, cutout.height / 2).render();
  artwork.destroy();
  return preview;
}
