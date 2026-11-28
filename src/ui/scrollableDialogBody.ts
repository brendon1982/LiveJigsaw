import type Phaser from 'phaser';
import type { UIScene } from './button';
import { styleWithTheme } from './theme';

const outlineInset = 2;
const scrollbarWidth = 6;
const scrollbarGap = 6;

export function wrapDialogText(label: Phaser.GameObjects.Text, width: number) {
  label.setWordWrapWidth(width, true).setFixedSize(width, 0);
}

export function makeScrollableDialogBody(
  scene: UIScene, content: ReturnType<UIScene['rexUI']['add']['sizer']>, depth: number, scrollbar = true,
) {
  const paddedContent = scene.rexUI.add.sizer({
    orientation: 'y',
    space: { left: outlineInset, right: outlineInset, top: outlineInset, bottom: outlineInset },
  }).add(content);
  let { width, height } = paddedContent.layout();
  const track = scrollbar ? scene.rexUI.add.roundRectangle(0, 0, scrollbarWidth, 10, 3).setDepth(depth) : undefined;
  const thumb = scrollbar ? scene.rexUI.add.roundRectangle(0, 0, scrollbarWidth, 28, 3).setDepth(depth) : undefined;
  const body = scene.rexUI.add.scrollablePanel({
    width, height,
    panel: { child: paddedContent, mask: { maskType: 'stencil' } },
    clampChildOY: true,
    scrollDetectionMode: 'rectBounds',
    scroller: { threshold: 10 },
    mouseWheelScroller: { focus: 2, speed: 0.75 },
    slider: track && thumb ? { track, thumb, adaptThumbSize: true, hideUnscrollableSlider: true } : undefined,
    space: { sliderY: scrollbarGap },
  }).setDepth(depth);
  styleWithTheme(body, (colors) => {
    track?.setFillStyle(colors.scrollbarTrack);
    thumb?.setFillStyle(colors.scrollbarThumb);
  });
  const fitContent = (availableHeight: number) => {
    const offset = body.childOY;
    body.setMinSize(width, Math.min(height, availableHeight)).layout().setChildOY(offset, true);
    body.setScrollerEnable(body.topChildOY !== body.bottomChildOY);
  };
  return {
    body,
    fitContent,
    responsiveLayout(maxWidth: number, layoutContent: (width: number) => void) {
      return {
        maxWidth,
        reflow(availableWidth: number) {
          const scrollbarSpace = scrollbar ? scrollbarWidth + scrollbarGap : 0;
          const innerWidth = Math.max(1, availableWidth - 2 * outlineInset - scrollbarSpace);
          layoutContent(innerWidth);
          content.setMinWidth(innerWidth);
          height = paddedContent.layout().height;
          width = availableWidth;
        },
        fitContent,
      };
    },
    containsTap(pointer: Phaser.Input.Pointer) {
      const camera = scene.cameras.main;
      const bounds = body.getBounds();
      const start = camera.getWorldPoint(pointer.downX, pointer.downY);
      const end = camera.getWorldPoint(pointer.x, pointer.y);
      return bounds.contains(start.x, start.y) && bounds.contains(end.x, end.y);
    },
  };
}