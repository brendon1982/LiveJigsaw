import type { UIScene } from './button';
import { styleWithTheme } from './theme';

const scrollbarWidth = 10;
const scrollbarGap = 14;
export const cardScrollbarSpace = scrollbarWidth + scrollbarGap;
export const cardScrollThreshold = 10;

export function isNearCardViewport(
  { y, height, originY }: { y: number; height: number; originY: number },
  { top, bottom }: { top: number; bottom: number }, rowGap: number,
) {
  const cardTop = y - height * originY;
  const buffer = height + rowGap;
  return cardTop + height > top - buffer && cardTop < bottom + buffer;
}

export function makePuzzleCardPanel(scene: UIScene, list: ReturnType<UIScene['rexUI']['add']['sizer']>) {
  const track = scene.rexUI.add.roundRectangle(0, 0, 8, 10, 4);
  const thumb = scene.rexUI.add.roundRectangle(0, 0, scrollbarWidth, 36, 5);
  const panel = scene.rexUI.add.scrollablePanel({
    panel: { child: list, mask: { maskType: 'stencil' } },
    clampChildOY: true,
    scrollDetectionMode: 'rectBounds',
    scroller: { threshold: cardScrollThreshold },
    mouseWheelScroller: { focus: 2, speed: 0.75 },
    slider: {
      track, thumb,
      adaptThumbSize: true,
      minThumbSize: 36,
      hideUnscrollableSlider: true,
    },
    space: { sliderY: scrollbarGap },
  }).setOrigin(0);
  styleWithTheme(panel, (colors) => {
    track.setFillStyle(colors.scrollbarTrack);
    thumb.setFillStyle(colors.scrollbarThumb);
  });
  return panel;
}

export function refreshPuzzleCardMask(panel: ReturnType<typeof makePuzzleCardPanel>) {
  const block = panel.getElement('scrollableBlock') as { setMaskChildrenFlag(): void } | null;
  block?.setMaskChildrenFlag();
}