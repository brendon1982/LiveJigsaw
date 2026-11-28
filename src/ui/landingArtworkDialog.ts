import Phaser from 'phaser';
import type { LandingArtwork } from '../landingArtwork/catalog';
import type { UIScene } from './button';
import { captureImageArtwork, makePreviewCornerCutout, makeScalableArtwork } from './PuzzlePickerCard';
import { showArtworkDetails } from './puzzleDetailsDialog';

export function showLandingArtworkDetails(scene: UIScene, title: string, entry: LandingArtwork, onClose: () => void) {
  const artwork = makeLandingArtworkBanner(scene, entry);
  const { name, artistUrl, sourceUrl } = entry.attribution;
  return showArtworkDetails(scene, artwork, onClose, { title, credits: [name, artistUrl, sourceUrl] });
}

function makeLandingArtworkBanner(scene: UIScene, { image, banner, focus }: LandingArtwork) {
  const cutout = makePreviewCornerCutout(scene);
  const bannerReady = banner && scene.textures.exists(banner.key);
  const preview = bannerReady ? captureImageArtwork(scene, banner.key, cutout, focus)
    : captureImageArtwork(scene, image.key, cutout);
  const artwork = makeScalableArtwork(scene, preview);
  artwork.once(Phaser.GameObjects.Events.DESTROY, () => scene.textures.remove(cutout));
  if (!banner || bannerReady) return artwork;

  const loaded = `filecomplete-image-${banner.key}`;
  const showFullArtwork = () => {
    const fullArtwork = captureImageArtwork(scene, banner.key, cutout, focus).removeFromDisplayList();
    const { displayWidth, displayHeight } = artwork;
    artwork.texture = fullArtwork.texture;
    artwork.setFrame(fullArtwork.texture.get().name).setDisplaySize(displayWidth, displayHeight);
    scene.rexUI.getParentSizer(artwork)?.resetChildScaleState(artwork);
    artwork.once(Phaser.GameObjects.Events.DESTROY, () => fullArtwork.destroy());
  };
  scene.load.once(loaded, showFullArtwork);
  artwork.once(Phaser.GameObjects.Events.DESTROY, () => scene.load.off(loaded, showFullArtwork));
  scene.load.image(banner.key, banner.url);
  scene.load.start();
  return artwork;
}