import Phaser from 'phaser';
import { challengeModes, type ChallengeMode } from '../domain/challengeModes';
import { connectorStyles, type ConnectorStyleId } from '../domain/connectorStyles';
import {
  defaultPieceShape, getPieceCount, pieceShapeIds, pieceShapes, type PieceShape, type PuzzleSize,
} from '../domain/puzzleSizes';
import type { PuzzleOptions, PuzzleProgress } from '../persistence/GameSave';
import { puzzleAnimationSpeeds, type PuzzleSource } from '../puzzles/PuzzleSource';
import { puzzleSizeChoices } from '../puzzles/puzzleSizeChoices';
import { makeButtonLabel, makeOptionTile, type UIScene } from './button';
import { challengeDescriptions } from './challengeDescriptions';
import { makeHoverTooltip } from './hoverTooltip';
import { makeScrollableDialogBody, wrapDialogText } from './scrollableDialogBody';
import { metadataTextStyle, palette, styleWithTheme } from './theme';

const optionWidth = 96;
const optionGap = 8;
const contentWidth = 4 * optionWidth + 3 * optionGap;
const fiveOptionWidth = (contentWidth - 4 * optionGap) / 5;
// RexUI sizer children are separate entries in the Phaser display list.
const depth = { cover: 1, panel: 2, controls: 3, tileContents: 4, tooltip: 5 };
export const pickerControlDepth = depth.controls;

type Option<Name extends string> = {
  name: Name;
  label?: string;
  height?: number;
  drawIcon?: () => Phaser.GameObjects.Container;
};

export function showPuzzleOptions(
  scene: UIScene,
  source: PuzzleSource,
  defaults: PuzzleOptions | undefined,
  play: (size: PuzzleSize, options: PuzzleOptions) => void,
  onClose: () => void,
) {
  const styles = Object.keys(connectorStyles) as ConnectorStyleId[];
  const sizeChoices = puzzleSizeChoices(source);
  const initialSize = sizeChoices.find(({ targetCount }) => targetCount === defaults?.pieceCount) ?? sizeChoices[0];
  const sizeTileWidth = sizeChoices.length > 4 ? fiveOptionWidth : optionWidth;
  const buttonsFor = <Name extends string>(options: readonly Option<Name>[], selected: string, width?: number, fontSize?: string) =>
    makeRadioButtons(scene, options, selected, (pointer) => scroll.containsTap(pointer), width, fontSize);
  const sizeButtons = buttonsFor(sizeChoices.map(({ targetCount }) => ({
    name: String(targetCount),
    label: String(targetCount),
  })), String(initialSize.targetCount), sizeTileWidth);
  const shapeButtons = buttonsFor(pieceShapeIds.map((shape) => ({
    name: shape,
    height: 52,
    drawIcon: () => drawPieceShapeIcon(scene, shape),
  })), defaults?.pieceShape ?? defaultPieceShape, fiveOptionWidth);
  const styleButtons = buttonsFor(styles.map((style) => ({
    name: style,
    drawIcon: () => drawConnectorIcon(scene, style),
  })), defaults?.connectorStyle ?? 'classic');
  const speedButtons = source.motion === 'Animated' ? buttonsFor(puzzleAnimationSpeeds.map((speed) => ({
    name: speed,
    label: speed,
  })), defaults?.animationSpeed ?? 'Normal') : undefined;
  const rotationButtons = buttonsFor(['Off', 'On'].map((label) => ({ name: label, label })),
    defaults?.pieceRotation ? 'On' : 'Off');
  const modes = Object.keys(challengeModes) as ChallengeMode[];
  const modeButtons = buttonsFor(modes.map((mode) => ({
    name: mode,
    label: mode === 'sequential-window' ? challengeModes[mode].label.replace(' ', '\n') : challengeModes[mode].label,
  })), defaults?.challengeMode ?? 'none', fiveOptionWidth, '14px');

  const content = scene.rexUI.add.sizer({ orientation: 'y', width: contentWidth, space: { item: 14 } });
  const currentCut = () => {
    const targetCount = Number(sizeButtons.getSelectedButtonName());
    const sizeChoice = sizeChoices.find((choice) => choice.targetCount === targetCount);
    const pieceShape = pieceShapeIds.find((shape) => shape === shapeButtons.getSelectedButtonName());
    if (sizeChoice && pieceShape) return { targetCount, pieceShape, size: sizeChoice.preset[pieceShape] };
  };
  const sections = [
    [source.motion === 'Static' ? 'Target piece count' : 'Piece count', sizeButtons],
    ['Piece shape', shapeButtons],
    ['Connector style', styleButtons],
    ['Animation speed', speedButtons],
    ['Piece rotation', rotationButtons],
    ['Challenge mode', modeButtons],
  ] as const;
  for (const [heading, buttons] of sections) {
    if (!buttons) continue;
    const section = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 6 } });
    section.add(scene.add.text(0, 0, heading, {
      fontFamily: 'system-ui', fontSize: '17px', color: palette.mutedText,
    }).setFixedSize(0, 24).setDepth(depth.controls), { align: 'left' });
    section.add(buttons, { align: 'left' });
    if (source.motion === 'Static' && buttons === sizeButtons) {
      const sizeRowWidth = sizeChoices.length * (sizeTileWidth + optionGap) - optionGap;
      const cutSummary = scene.add.text(0, 0, '', {
        ...metadataTextStyle, align: 'right',
      }).setFixedSize(sizeRowWidth, 22).setDepth(depth.controls);
      styleWithTheme(cutSummary, (colors) => cutSummary.setColor(colors.mutedText));
      const updateCutSummary = () => {
        const cut = currentCut();
        if (cut) cutSummary.setText(`${getPieceCount(cut.size)} pieces · ${cut.size.columns} × ${cut.size.rows}`);
      };
      sizeButtons.on('button.click', updateCutSummary);
      shapeButtons.on('button.click', updateCutSummary);
      updateCutSummary();
      section.add(cutSummary, { align: 'left' });
    }
    content.add(section, { align: 'left' });
  }

  const actions = [
    makeButtonLabel(scene, 'Cancel', 92, 52),
    makeButtonLabel(scene, 'Play', 92, 52, true),
  ];
  const scroll = makeScrollableDialogBody(scene, content, depth.controls);
  const tooltips = makeHoverTooltip(scene, { depth: depth.tooltip });
  const canHover = (pointer: Phaser.Input.Pointer) => {
    const { x, y } = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return scroll.body.getBounds().contains(x, y);
  };
  for (const { button, name } of modeButtons.tiles) {
    tooltips.attach(button, challengeDescriptions[name], canHover);
  }
  scroll.body.on('scroll', tooltips.hide);

  const dialog = showPickerDialog(scene, source.title, scroll.body, actions, (action) => {
    onClose();
    if (action !== 1) return;

    const cut = currentCut();
    const style = styles.find((id) => id === styleButtons.getSelectedButtonName());
    const speed = puzzleAnimationSpeeds.find((name) => name === speedButtons?.getSelectedButtonName())
      ?? defaults?.animationSpeed ?? 'Normal';
    const challengeMode = modes.find((id) => id === modeButtons.getSelectedButtonName());
    const pieceRotation = rotationButtons.getSelectedButtonName() === 'On';
    if (cut && style && challengeMode) {
      play(cut.size, {
        pieceCount: cut.targetCount, pieceShape: cut.pieceShape,
        connectorStyle: style, animationSpeed: speed, challengeMode, pieceRotation,
      });
    }
  }, { fitContent: scroll.fitContent });
  dialog.once('destroy', tooltips.destroy);
  return dialog;
}

export function showResumePuzzle(
  scene: UIScene,
  source: PuzzleSource,
  progress: PuzzleProgress,
  onClose: (choice: 'resume' | 'reset' | 'cancel') => void,
) {
  const { size, connectorStyle, animationSpeed, challengeMode, pieceRotation } = progress.setup;
  const pieceCount = getPieceCount(size);
  const lines = [
    `${progress.placedPieceIds.length} of ${pieceCount} placed`,
    `Puzzle size: ${pieceCount}`,
    `Connector style: ${connectorStyles[connectorStyle].label}`,
    `Animation speed: ${animationSpeed}`,
    `Piece rotation: ${pieceRotation ? 'On' : 'Off'}`,
    `Challenge mode: ${challengeModes[challengeMode].label}`,
  ];
  const content = scene.rexUI.add.sizer({ orientation: 'y', space: { item: 4 } });
  const labels = lines.map((line) => {
    const label = scene.add.text(0, 0, line, {
      fontFamily: 'system-ui', fontSize: '17px', color: palette.mutedText,
    }).setDepth(depth.controls);
    content.add(label, { align: 'left' });
    return label;
  });
  const scroll = makeScrollableDialogBody(scene, content, depth.controls);
  const actions = [
    makeButtonLabel(scene, 'Cancel', 92, 52),
    makeButtonLabel(scene, 'Reset', 92, 52),
    makeButtonLabel(scene, 'Resume', 104, 52, true),
  ];
  return showPickerDialog(scene, source.title, scroll.body, actions, (action) => {
    onClose(action === 2 ? 'resume' : action === 1 ? 'reset' : 'cancel');
  }, {
    responsive: scroll.responsiveLayout(304, (width) => labels.forEach((label) => wrapDialogText(label, width))),
  });
}

export const pickerDialogInset = 20;
export type PickerDialogTitle = string | { artwork: Phaser.GameObjects.Image; cornerRadius: number };

export function showPickerDialog(
  scene: UIScene,
  title: PickerDialogTitle,
  content: Phaser.GameObjects.GameObject & { height: number },
  actions: ReturnType<typeof makeButtonLabel>[],
  onClose: (action?: number) => void,
  options?: {
    fitContent?: (height: number) => void;
    responsive?: { maxWidth: number; reflow: (width: number) => void; fitContent: (height: number) => void };
    handleAction?: (index: number) => boolean;
    footerLabel?: Phaser.GameObjects.Text;
  },
) {
  const cover = scene.add.rectangle(0, 0, 1, 1, palette.modalBackdrop, 0.72)
    .setOrigin(0).setDepth(depth.cover).setInteractive();
  const artworkHeader = typeof title !== 'string';
  const responsive = options?.responsive;
  const radius = artworkHeader ? { tl: title.cornerRadius, tr: title.cornerRadius, bl: 16, br: 16 } : 16;
  const inset = artworkHeader ? 0 : pickerDialogInset;
  const bodyInset = artworkHeader ? pickerDialogInset : 0;
  const background = scene.rexUI.add.roundRectangle(0, 0, 1, 1, radius).setDepth(depth.panel);
  const titleLabel = artworkHeader ? undefined : scene.add.text(0, 0, title, {
    fontFamily: 'system-ui', fontSize: '25px', fontStyle: 'bold',
  }).setFixedSize(0, responsive ? 0 : 34).setDepth(depth.controls);
  actions.forEach((button) => button.setDepth(depth.controls));
  const dialog = scene.rexUI.add.dialog({
    background,
    title: artworkHeader ? title.artwork.setDepth(depth.controls) : titleLabel,
    content,
    actions: responsive ? undefined : actions,
    align: { title: 'left', actions: 'right' },
    space: {
      top: inset, left: inset, right: inset, bottom: pickerDialogInset, title: 14, content: 18, action: 8,
      contentLeft: bodyInset, contentRight: bodyInset, actionsLeft: bodyInset, actionsRight: bodyInset,
    },
    click: { mode: 'release', clickInterval: 0 },
  });
  const wrappingActions = responsive && scene.rexUI.add.fixWidthButtons({
    buttons: actions, groupName: 'actions', eventEmitter: dialog, align: 'right',
    space: { item: 8, line: 8 }, click: { mode: 'release', clickInterval: 0 },
  });
  if (wrappingActions) {
    dialog.add(wrappingActions, { padding: { top: 18 } });
    dialog.addChildrenMap('actionsSizer', wrappingActions);
    // @ts-expect-error RexUI maps the action array here in its own Dialog constructor.
    dialog.addChildrenMap('actions', actions);
  }
  styleWithTheme(dialog, (colors) => {
    cover.setFillStyle(colors.modalBackdrop, 0.72);
    background.setFillStyle(colors.surface).setStrokeStyle(1, colors.border);
    titleLabel?.setColor(colors.text);
  });
  if (options?.footerLabel) {
    const actionsRow = dialog.getElement('actionsSizer') as ReturnType<UIScene['rexUI']['add']['sizer']>;
    actionsRow.insert(0, options.footerLabel.setDepth(depth.controls), { key: 'footerLabel' });
  }
  actions.forEach((button) => { button.input!.cursor = 'pointer'; });

  const fit = () => {
    const { width, height } = scene.scale.gameSize;
    const { zoom } = scene.cameras.main;
    dialog.setScale(1);
    cover.setSize(width / zoom, height / zoom);
    dialog.setPosition(width / (2 * zoom), height / (2 * zoom));
    if (responsive && wrappingActions) {
      const innerWidth = Math.max(1, Math.min(responsive.maxWidth, width - 24 - 2 * pickerDialogInset));
      titleLabel?.setWordWrapWidth(innerWidth, true).setFixedSize(innerWidth, 0);
      wrappingActions.setMinWidth(innerWidth);
      responsive.reflow(innerWidth);
      dialog.layout();
      const chromeHeight = dialog.height - content.height;
      responsive.fitContent(Math.max(1, height - 24 - chromeHeight));
      dialog.layout().setScale(1 / zoom);
      return;
    }
    dialog.layout();
    if (options?.fitContent) {
      const widthScale = Math.min(1, Math.max(1, width - 24) / dialog.width);
      const chromeHeight = dialog.height - content.height;
      options.fitContent(Math.max(1, (height - 24) / widthScale - chromeHeight));
      dialog.layout();
    }
    const scale = Math.min(1, Math.max(1, width - 24) / dialog.width, Math.max(1, height - 24) / dialog.height);
    dialog.setScale(scale / zoom);
  };
  const cancel = () => dialog.modalClose();
  let action: number | undefined;
  dialog.on('action.click', (_button: Phaser.GameObjects.GameObject, index: number, pointer: Phaser.Input.Pointer) => {
    if (pointer.wasCanceled || options?.handleAction?.(index)) return;
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

function makeRadioButtons<Name extends string>(
  scene: UIScene, options: readonly Option<Name>[], selectedName: string, canSelect: (pointer: Phaser.Input.Pointer) => boolean,
  width = optionWidth, fontSize = '15px',
) {
  const buttons = scene.rexUI.add.sizer({ orientation: 'x', space: { item: optionGap } });
  const tiles = options.map((option) => ({
    name: option.name,
    ...makeOptionTile(scene, {
      ...option, width, fontSize, depth: depth.controls, contentDepth: depth.tileContents, dragThreshold: 10,
      onClick: (pointer) => {
        if (!canSelect(pointer)) return;
        selectedName = option.name;
        updateSelection();
        buttons.emit('button.click');
      },
    }),
  }));
  const updateSelection = () => tiles.forEach((tile) => tile.setSelected(tile.name === selectedName));
  tiles.forEach(({ button }) => buttons.add(button));
  updateSelection();
  return Object.assign(buttons, { tiles, getSelectedButtonName: () => selectedName });
}

function drawPieceShapeIcon(scene: UIScene, shape: PieceShape) {
  const { width, height } = pieceShapes[shape];
  const iconSize = 36;
  const scale = iconSize / Math.max(width, height);
  const art = scene.add.rectangle(0, 0, width * scale, height * scale, palette.optionIcon)
    .setStrokeStyle(1.5, palette.optionIconOutline);
  return scene.add.container(0, 0, [art]).setSize(iconSize, iconSize);
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
