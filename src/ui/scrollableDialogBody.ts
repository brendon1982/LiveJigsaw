import type Phaser from 'phaser';
import type { UIScene } from './button';
import { styleWithTheme } from './theme';

const outlineInset = 2;

export function makeScrollableDialogBody(
  scene: UIScene, content: ReturnType<UIScene['rexUI']['add']['sizer']>, depth: number, scrollbar = true,
) {
  const paddedContent = scene.rexUI.add.sizer({
    orientation: 'y',
    space: { left: outlineInset, right: outlineInset, top: outlineInset, bottom: outlineInset },
  }).add(content);
  const { width, height } = paddedContent.layout();
  const track = scrollbar ? scene.rexUI.add.roundRectangle(0, 0, 6, 10, 3).setDepth(depth) : undefined;
  const thumb = scrollbar ? scene.rexUI.add.roundRectangle(0, 0, 6, 28, 3).setDepth(depth) : undefined;
  const body = scene.rexUI.add.scrollablePanel({
    width, height,
    panel: { child: paddedContent, mask: { maskType: 'stencil' } },
    clampChildOY: true,
    scrollDetectionMode: 'rectBounds',
    scroller: { threshold: 10 },
    mouseWheelScroller: { focus: 2, speed: 0.75 },
    slider: track && thumb ? { track, thumb, adaptThumbSize: true, hideUnscrollableSlider: true } : undefined,
    space: { sliderY: 6 },
  }).setDepth(depth);
  styleWithTheme(body, (colors) => {
    track?.setFillStyle(colors.scrollbarTrack);
    thumb?.setFillStyle(colors.scrollbarThumb);
  });
  return {
    body,
    fitContent(availableHeight: number) {
      const offset = body.childOY;
      body.setMinSize(width, Math.min(height, availableHeight)).layout().setChildOY(offset, true);
      body.setScrollerEnable(body.topChildOY !== body.bottomChildOY);
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