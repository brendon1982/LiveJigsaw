import { makeButton, type UIScene } from './button';

export const headerInset = 24;
export const headerGap = 16;
export const headerControlGap = 8;

export function puzzleHeader(width: number, narrowWidth = 480) {
  const narrow = width < narrowWidth;
  return { narrow, height: narrow ? 110 : 84, buttonY: narrow ? 12 : 22 };
}

export function makeSettingsButton(scene: UIScene, open: () => void, header = puzzleHeader) {
  const button = makeButton(scene, 0, 0, 'Settings', (pointer) => {
    if (!pointer.wasCanceled) open();
  }, 100);
  return {
    button,
    layout(width: number, zoom = 1) {
      button.setScale(1 / zoom).setPosition((width - headerInset - button.width) / zoom, header(width).buttonY / zoom);
    },
  };
}
