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

export function pickerCardHeight(width: number, stackStatus: boolean, compact: boolean, hasCredits: boolean) {
  const artworkHeight = previewHeight * width / maxPickerCardWidth;
  if (compact) return artworkHeight + footerActionHeight;
  const stackCredits = hasCredits && width < compactFooterWidth;
  return artworkHeight + footerHeight + (stackStatus ? statusRowHeight : 0) + (stackCredits ? creditsRowHeight : 0);
}

export function measurePickerStatus(source: PuzzleSource, status: string, context: CanvasRenderingContext2D) {
  if (!status) return 0;
  const measure = (text: string) => Math.ceil(context.measureText(text).width);
  return measure(puzzleCardTags(source)) + headerControlGap + measure(status) + 2 * footerInset;
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
  const metadata = puzzleCardTags(source);
  const title = scene.add.text(0, 0, '', {
    fontFamily: 'system-ui', fontSize: '22px', fontStyle: 'bold', color: palette.text,
  }).setOrigin(0, 0.5);

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
  let fullFooter: ReturnType<typeof makeFullFooter> | undefined;
  styleWithTheme(background, (colors) => {
    background.setFillStyle(pressed ? colors.surfacePressed : colors.surface);
    if (title.style.color !== colors.text) title.setColor(colors.text);
    fullFooter?.tags.setColor(colors.mutedText);
    fullFooter?.statusLabel?.setColor(colors.text);
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
    .addLocal([background, title]);
  const makeFooterAction = (name: string, text: string, width: number, action: () => void) => {
    const caption = scene.add.text(0, 0, text, { ...metadataTextStyle, color: palette.mutedText });
    const button = scene.rexUI.add.label({ width, height: footerActionHeight, align: 'right', text: caption })
      .setName(`picker-${name}`).setOrigin(1, 0.5).layout();
    let actionPressed = false;
    const restyle = (colors: typeof palette) => {
      const color = actionPressed ? colors.text : colors.mutedText;
      if (caption.style.color !== color) caption.setColor(color);
    };
    styleWithTheme(button, restyle);
    addPressFeedback(button, (value) => { actionPressed = value; restyle(palette); }, scrollThreshold,
      (pointer) => isInsideList(pointer.x, pointer.y));
    bindTap(button, action);
    container.addLocal(button);
    return { button, caption };
  };
  const previewCopies = new Set<Phaser.GameObjects.Image>();
  function copyPreview() {
    const artwork = scene.add.image(0, 0, preview?.texture ?? '__DEFAULT');
    previewCopies.add(artwork);
    artwork.once(Phaser.GameObjects.Events.DESTROY, () => previewCopies.delete(artwork));
    return artwork;
  }
  let more: ReturnType<typeof makeFooterAction>['button'] | undefined;
  function makeFullFooter() {
    const tags = scene.add.text(0, 0, '', { ...metadataTextStyle, color: palette.mutedText }).setOrigin(0, 0.5);
    container.addLocal(tags);
    const statusLabel = status ? scene.add.text(0, 0, '', { ...metadataTextStyle, color: palette.text }).setOrigin(1, 0.5) : undefined;
    if (statusLabel) container.addLocal(statusLabel);
    const artistName = hasCredits ? creditedArtistName(source.attribution) ?? 'Credits' : undefined;
    const credits = artistName && makeFooterAction('credits', '', footerActionHeight, () => openDetails(copyPreview));
    return { tags, statusLabel, artistName, credits };
  }
  const setFullFooterVisible = (visible: boolean) => {
    if (!fullFooter) return;
    const { tags, statusLabel, credits } = fullFooter;
    container.setChildVisible(tags, visible);
    if (statusLabel) container.setChildVisible(statusLabel, visible);
    if (credits) container.setChildVisible(credits.button, visible);
  };
  return {
    container,
    previewImage: source.previewImage,
    get previewInUse() { return previewCopies.size > 0; },
    get hasPreview() { return preview !== undefined; },
    drawPreview() {
      preview = makePreview(scene, source, cutout).setTint(pressed ? 0xececec : 0xffffff);
      const scale = container.width / maxPickerCardWidth;
      container.addLocal(preview).setChildLocalScale(preview, scale, scale);
      for (const artwork of previewCopies) {
        const { displayWidth, displayHeight } = artwork;
        artwork.texture = preview.texture;
        artwork.setFrame(preview.texture.get().name).setDisplaySize(displayWidth, displayHeight);
        scene.rexUI.getParentSizer(artwork)?.resetChildScaleState(artwork);
      }
    },
    layout(width: number, stackStatus: boolean, compact: boolean) {
      const scale = width / maxPickerCardWidth;
      const artworkBottom = previewHeight * scale;
      const compactFooter = width < compactFooterWidth;
      const height = pickerCardHeight(width, stackStatus, compact, hasCredits);
      const inset = compact ? compactFooterInset : footerInset;
      const right = width - inset;
      const textWidth = Math.max(0, right - inset);
      container.setSize(width, height);
      background.setRadius(pickerCardCornerRadius * scale).resize(width, height);
      if (background.input) background.input.hitArea.setSize(width, height);
      if (preview) container.setChildLocalScale(preview, scale, scale);
      const titleSize = compact || compactFooter ? '16px' : '22px';
      if (title.style.fontSize !== titleSize) title.setFontSize(titleSize);
      if (compact) {
        more ??= makeFooterAction('more', '...', moreWidth, () => openDetails(copyPreview)).button;
        container.setChildVisible(more, true);
        setFullFooterVisible(false);
        const titleY = artworkBottom + footerActionHeight / 2;
        fitLabel(title, source.title, Math.max(0, textWidth - moreWidth - headerControlGap));
        container.setChildLocalPosition(title, inset, titleY);
        container.setChildLocalPosition(more, right, titleY);
        return;
      }

      fullFooter ??= makeFullFooter();
      setFullFooterVisible(true);
      if (more) container.setChildVisible(more, false);
      const { tags, statusLabel, artistName, credits } = fullFooter;
      const metadataY = artworkBottom + 50;
      const stackCredits = hasCredits && compactFooter;
      let titleWidth = textWidth;
      if (credits && artistName) {
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
      container.setChildLocalPosition(title, footerInset, artworkBottom + 23);
      container.setChildLocalPosition(tags, footerInset, metadataY);
      if (statusLabel) {
        fitLabel(statusLabel, status, textWidth);
        statusLabel.setOrigin(stackStatus ? 0 : 1, 0.5);
        container.setChildLocalPosition(statusLabel, stackStatus ? footerInset : right,
          metadataY + (stackStatus ? statusRowHeight : 0));
      }
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
  const characters = Array.from(value);
  let fitting = 0;
  let tooLong = characters.length + 1;
  while (fitting + 1 < tooLong) {
    const length = Math.floor((fitting + tooLong) / 2);
    const candidate = `${characters.slice(0, length).join('')}…`;
    if (context.measureText(candidate).width <= width) fitting = length;
    else tooLong = length;
  }
  label.setText(fitting ? `${characters.slice(0, fitting).join('')}…` : '');
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
