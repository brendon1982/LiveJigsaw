import Phaser from 'phaser';
import { connectorStyles, type ConnectorStyleId } from '../domain/connectorStyles';
import { availablePuzzleSizes, type PuzzleSize } from '../domain/puzzleSizes';
import type { PuzzleOptions } from '../persistence/GameSave';
import { puzzleAnimationSpeeds, type PuzzleAnimationSpeed, type PuzzleSource } from '../puzzles/PuzzleSource';
import { makeButtonLabel, type UIScene } from './button';
import { palette } from './theme';

const optionWidth = 96;
const optionGap = 8;
const contentWidth = 4 * optionWidth + 3 * optionGap;
// RexUI sizer children are separate entries in the Phaser display list.
const depth = { cover: 1, panel: 2, controls: 3, tileContents: 4 };

type Option = {
  name: string;
  label: string;
  drawIcon?: () => Phaser.GameObjects.Container;
};

export function showPuzzleOptions(
  scene: UIScene,
  source: PuzzleSource,
  defaults: PuzzleOptions | undefined,
  play: (size: PuzzleSize, connectorStyle: ConnectorStyleId, animationSpeed: PuzzleAnimationSpeed) => void,
  onClose: () => void,
) {
  const sizes = availablePuzzleSizes(source.maxViewport);
  const styles = Object.keys(connectorStyles) as ConnectorStyleId[];
  const initialSize = sizes.find(({ label }) => label === defaults?.sizeLabel) ?? sizes[0];
  const sizeButtons = makeRadioButtons(scene, sizes.map((size) => ({
    name: size.label,
    label: `${size.label} · ${size.columns * size.rows}`,
    drawIcon: () => drawSizeIcon(scene, size),
  })), initialSize.label);
  const styleButtons = makeRadioButtons(scene, styles.map((style) => ({
    name: style,
    label: connectorStyles[style].label,
    drawIcon: () => drawConnectorIcon(scene, style),
  })), defaults?.connectorStyle ?? 'classic');
  const speedButtons = makeRadioButtons(scene, puzzleAnimationSpeeds.map((speed) => ({
    name: speed,
    label: speed,
  })), defaults?.animationSpeed ?? 'Normal');

  const content = scene.rexUI.add.sizer({ orientation: 'y', width: contentWidth, space: { item: 14 } });
  const sections = [
    ['Puzzle size', sizeButtons],
    ['Connector style', styleButtons],
    ['Animation speed', speedButtons],
  ] as const;
  for (const [heading, buttons] of sections) {
    const section = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 6 } });
    section.add(scene.add.text(0, 0, heading, {
      fontFamily: 'system-ui', fontSize: '17px', color: palette.mutedText,
    }).setFixedSize(0, 24).setDepth(depth.controls), { align: 'left' });
    section.add(buttons, { align: 'left' });
    content.add(section, { align: 'left' });
  }

  const actions = [
    makeButtonLabel(scene, 'Cancel', 92, 52),
    makeButtonLabel(scene, 'Play', 92, 52, true),
  ];
  return showPickerDialog(scene, source.title, content, actions, (action) => {
    onClose();
    if (action !== 1) return;

    const size = sizes.find(({ label }) => label === sizeButtons.getSelectedButtonName());
    const style = styles.find((id) => id === styleButtons.getSelectedButtonName());
    const speed = puzzleAnimationSpeeds.find((name) => name === speedButtons.getSelectedButtonName());
    if (size && style && speed) play(size, style, speed);
  });
}

export function showResumePuzzle(
  scene: UIScene,
  source: PuzzleSource,
  placedCount: number,
  pieceCount: number,
  onClose: (choice: 'resume' | 'reset' | 'cancel') => void,
) {
  const content = scene.rexUI.add.sizer({ orientation: 'y' });
  content.add(scene.add.text(0, 0, `${placedCount} of ${pieceCount} pieces placed`, {
    fontFamily: 'system-ui', fontSize: '17px', color: palette.mutedText,
  }).setDepth(depth.controls), { align: 'left' });
  const actions = [
    makeButtonLabel(scene, 'Cancel', 92, 52),
    makeButtonLabel(scene, 'Reset', 92, 52),
    makeButtonLabel(scene, 'Resume', 104, 52, true),
  ];
  return showPickerDialog(scene, source.title, content, actions, (action) => {
    onClose(action === 2 ? 'resume' : action === 1 ? 'reset' : 'cancel');
  });
}

function showPickerDialog(
  scene: UIScene,
  title: string,
  content: ReturnType<UIScene['rexUI']['add']['sizer']>,
  actions: ReturnType<typeof makeButtonLabel>[],
  onClose: (action?: number) => void,
) {
  const cover = scene.add.rectangle(0, 0, 1, 1, palette.modalBackdrop, 0.72)
    .setOrigin(0).setDepth(depth.cover).setInteractive();
  const dialog = scene.rexUI.add.dialog({
    background: scene.rexUI.add.roundRectangle(0, 0, 1, 1, 16, palette.surface)
      .setStrokeStyle(1, palette.border).setDepth(depth.panel),
    title: scene.add.text(0, 0, title, {
      fontFamily: 'system-ui', fontSize: '25px', fontStyle: 'bold', color: palette.text,
    }).setFixedSize(0, 34).setDepth(depth.controls),
    content,
    actions: actions.map((button) => button.setDepth(depth.controls)),
    align: { title: 'left', actions: 'right' },
    space: { top: 20, bottom: 20, left: 20, right: 20, title: 14, content: 18, action: 8 },
    click: { mode: 'release', clickInterval: 0 },
  }).layout();

  dialog.forEachAction((button) => { button.input!.cursor = 'pointer'; });

  const fit = () => {
    const { width, height } = scene.scale.gameSize;
    const { zoom } = scene.cameras.main;
    const scale = Math.min(1, Math.max(1, width - 24) / dialog.width, Math.max(1, height - 24) / dialog.height);
    cover.setSize(width / zoom, height / zoom);
    dialog.setPosition(width / (2 * zoom), height / (2 * zoom)).setScale(scale / zoom);
  };
  const cancel = () => dialog.modalClose();
  let action: number | undefined;
  dialog.on('action.click', (_button: Phaser.GameObjects.GameObject, index: number, pointer: Phaser.Input.Pointer) => {
    if (pointer.wasCanceled) return;
    action = index;
    dialog.modalClose();
  });

  scene.scale.on('resize', fit);
  scene.input.keyboard?.on('keydown-ESC', cancel);
  dialog.once('destroy', () => {
    cover.destroy();
    scene.scale.off('resize', fit);
    scene.input.keyboard?.off('keydown-ESC', cancel);
  });
  fit();

  dialog.modal({
    defaultBehavior: false,
    manualClose: true,
    // @ts-expect-error RexUI accepts false at runtime to disable its cover.
    cover: false,
    duration: { in: 0, out: 0 },
  }, () => onClose(action));

  return dialog;
}

function makeRadioButtons(scene: UIScene, options: readonly Option[], selectedName: string) {
  const tiles = options.map(({ name, label, drawIcon }) => {
    const background = scene.rexUI.add.roundRectangle(0, 0, 1, 1, 9, palette.background)
      .setStrokeStyle(1, palette.optionBorder).setDepth(depth.controls);
    const button = scene.rexUI.add.label({
      name, width: optionWidth, height: drawIcon ? 82 : 52, orientation: 'y', align: 'center', background,
      icon: drawIcon?.().setDepth(depth.tileContents),
      text: scene.add.text(0, 0, label, { fontFamily: 'system-ui', fontSize: '15px', color: palette.text })
        .setDepth(depth.tileContents),
      space: { icon: 4 },
    }).setDepth(depth.controls, true);
    return { button, background };
  });

  const buttons = scene.rexUI.add.buttons({
    orientation: 'x', type: 'radio', buttons: tiles.map(({ button }) => button),
    click: { threshold: 12, clickInterval: 0 },
    space: { item: optionGap },
    setValueCallback: (button, selected) => {
      const tile = tiles.find((entry) => entry.button === button)!;
      tile.background.setFillStyle(selected ? palette.selectedOption : palette.background)
        .setStrokeStyle(selected ? 2 : 1, selected ? palette.primaryButton : palette.optionBorder);
    },
  });
  for (const { button } of tiles) button.input!.cursor = 'pointer';
  return buttons.setSelectedButtonName(selectedName);
}

function drawSizeIcon(scene: UIScene, { columns, rows }: PuzzleSize) {
  const art = scene.add.graphics();
  const width = 60;
  const height = 34;
  art.fillStyle(palette.optionIcon).fillRect(-width / 2, -height / 2, width, height);
  art.lineStyle(1, palette.optionIconOutline).strokeRect(-width / 2, -height / 2, width, height);
  for (let column = 1; column < columns; column += 1) {
    const x = -width / 2 + (column * width) / columns;
    art.lineBetween(x, -height / 2, x, height / 2);
  }
  for (let row = 1; row < rows; row += 1) {
    const y = -height / 2 + (row * height) / rows;
    art.lineBetween(-width / 2, y, width / 2, y);
  }
  return scene.add.container(0, 0, [art]).setSize(64, 44);
}

function drawConnectorIcon(scene: UIScene, style: ConnectorStyleId) {
  const art = scene.add.graphics();
  const profile = connectorStyles[style].profiles[0] ?? [];
  const points = [
    new Phaser.Math.Vector2(-28, -5),
    ...profile.map(([along, depth]) => new Phaser.Math.Vector2(along, -5 - depth * 0.85)),
    new Phaser.Math.Vector2(28, -5),
    new Phaser.Math.Vector2(28, 16),
    new Phaser.Math.Vector2(-28, 16),
  ];
  art.fillStyle(palette.optionIcon).fillPoints(points, true);
  art.lineStyle(1.5, palette.optionIconOutline).strokePoints(points, true);
  return scene.add.container(0, 0, [art]).setSize(64, 44);
}
