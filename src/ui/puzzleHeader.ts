import { makeButton, type UIScene } from './button';

export const headerInset = 24;
export const puzzleSpacing = 16;
export const headerControlGap = 8;

export function makeSettingsButton(scene: UIScene, open: () => void) {
  const button = makeButton(scene, 0, 0, 'Settings', (pointer) => {
    if (!pointer.wasCanceled) open();
  }, 100);
  return {
    button,
    layout(width: number) {
      button.setPosition(width - headerInset - button.width, puzzleSpacing);
    },
  };
}
