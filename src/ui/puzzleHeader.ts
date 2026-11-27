import { makeIconButton, type UIScene } from './button';

export const headerInset = 24;
export const puzzleSpacing = 16;
export const headerControlGap = 8;

export function makeSettingsButton(scene: UIScene, open: () => void) {
  const button = makeIconButton(scene, 'Settings', (art, color) => {
    art.clear().lineStyle(1.75, color).strokeCircle(0, 0, 3).beginPath();
    for (let vertex = 0; vertex < 32; vertex++) {
      const angle = vertex * Math.PI / 16;
      const radius = vertex % 4 < 2 ? 10 : 7.5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (vertex === 0) art.moveTo(x, y);
      else art.lineTo(x, y);
    }
    art.closePath().strokePath();
  }, (pointer) => {
    if (!pointer.wasCanceled) open();
  }, { clickInterval: 0 });
  return {
    button,
    layout(width: number) {
      button.setPosition(width - headerInset - button.width, puzzleSpacing);
    },
  };
}

export function makeBackButton(scene: UIScene, open: () => void) {
  return makeIconButton(scene, 'All puzzles', (art, color) => {
    art.clear().lineStyle(2, color).beginPath()
      .moveTo(-2, -7).lineTo(-9, 0).lineTo(-2, 7).moveTo(-9, 0).lineTo(10, 0).strokePath();
  }, (pointer) => {
    if (!pointer.wasCanceled) open();
  }).setPosition(headerInset, puzzleSpacing);
}

export function makeFiltersButton(scene: UIScene, open: () => void) {
  return makeIconButton(scene, 'Filters', (art, color) => {
    art.clear().lineStyle(2, color).beginPath()
      .moveTo(-10, -8).lineTo(10, -8).lineTo(3, 0).lineTo(3, 7).lineTo(-3, 10).lineTo(-3, 0)
      .closePath().strokePath();
  }, (pointer) => {
    if (!pointer.wasCanceled) open();
  });
}
