import type Phaser from 'phaser';
import type { Bounds } from '../domain/geometry';
import { styleWithTheme } from './theme';

export function showPuzzleLoading(scene: Phaser.Scene) {
  const spinner = scene.add.graphics().setName('Puzzle loading spinner');
  const label = scene.add.text(0, 0, 'Loading puzzle…', { fontFamily: 'system-ui', fontSize: '16px' })
    .setOrigin(0.5).setName('Puzzle load status');
  styleWithTheme(label, (colors) => label.setColor(colors.text));
  styleWithTheme(spinner, (colors) => {
    spinner.clear().lineStyle(3, colors.scrollbarTrack).strokeCircle(0, 0, 15);
    spinner.lineStyle(3, colors.scrollbarThumb).beginPath().arc(0, 0, 15, -3 * Math.PI / 4, -Math.PI / 4).strokePath();
  });
  const spin = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? undefined
    : scene.tweens.add({ targets: spinner, rotation: 2 * Math.PI, duration: 800, repeat: -1 });

  return {
    layout({ center: { x, y } }: Bounds) {
      spinner.setPosition(x, y - 18);
      label.setPosition(x, spinner.visible ? y + 22 : y);
    },
    fail() {
      spin?.stop();
      spinner.setVisible(false);
      label.setText('Could not load the puzzle.').setY(spinner.y + 18);
    },
    destroy() {
      spin?.stop();
      spinner.destroy();
      label.destroy();
    },
  };
}