import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { build, preview } from 'vite';
import { createPuzzle, puzzleSizePresets } from '../src/domain/puzzleSizes.ts';
import { saveVersion } from '../src/persistence/saveMigrations.ts';

const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });

const filterY = { firstTheme: -256, secondTheme: -194, type: 83, completion: 174, motion: 262, action: 333 };
const resumeActionY = 114;
const compactPuzzlePath = '/compact-fixture/tests/fixtures/compact-puzzle.html';
const currentSizesPuzzlePath = `${compactPuzzlePath}?currentSizes`;
const compactSize = { width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 };
let compactPuzzleBuild;

async function seedNextAttempt(page, seed) {
  await page.evaluate((seed) => {
    const getRandomValues = crypto.getRandomValues;
    crypto.getRandomValues = (values) => {
      crypto.getRandomValues = getRandomValues;
      values[0] = seed;
      return values;
    };
  }, seed);
}

function readSave(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('live-jigsaw.save')));
}

async function saveFullHDPuzzle(page, title, seed) {
  await page.evaluate(({ title, seed }) => localStorage.setItem('live-jigsaw.save', JSON.stringify({
    version: 6,
    progress: { [title]: {
      setup: {
        size: { width: 1920, height: 1080, columns: 8, rows: 4, snapTolerance: 28 },
        seed, connectorStyle: 'classic', animationSpeed: 'Fast', challengeMode: 'none', pieceRotation: false,
      },
      placedPieceIds: ['piece-0-0'], trayOrientations: {},
    } },
  })), { title, seed });
  await page.reload();
}

function paceRepeatClicks(click) {
  // RexUI ignores another click on the same button within 100 ms.
  let nextClick = 0;
  return async () => {
    const remaining = Math.ceil(nextClick - performance.now());
    if (remaining > 0) await delay(remaining);
    await click();
    nextClick = performance.now() + 101;
  };
}

async function pixelAt(page, png, x, y) {
  return page.evaluate(async ({ png, x, y }) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + png;
    await image.decode();
    const pixel = document.createElement('canvas');
    pixel.width = pixel.height = 1;
    const context = pixel.getContext('2d');
    context.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  }, { png: png.toString('base64'), x, y });
}

async function touchController(page) {
  const touch = await page.context().newCDPSession(page);
  const dispatch = (type, ...points) => touch.send('Input.dispatchTouchEvent', {
    type, touchPoints: points.map(([x, y], id) => ({ x, y, id })),
  });
  const moveFinger = async (x, y, endX, endY, end = 'touchEnd') => {
    await dispatch('touchStart', [x, y]);
    for (let step = 1; step <= 8; step += 1) {
      await dispatch('touchMove', [x + (endX - x) * step / 8, y + (endY - y) * step / 8]);
    }
    await dispatch(end);
  };
  return { dispatch, moveFinger };
}

async function scrollPickerTo(page, wheelDelta) {
  await page.mouse.move(340, 300);
  await page.mouse.wheel(0, -30000);
  await page.mouse.wheel(0, wheelDelta);
}

function waitForPicker(page) {
  return page.waitForFunction(() => window.puzzlePickerScene?.sys.isActive()
    && window.puzzlePickerScene.children.getByName('Settings')?.input?.enabled, undefined, { timeout: 4000 });
}

function uiControl(page, { sceneKey, name, text, action, filterCount, primary }) {
  return page.waitForFunction(({ sceneKey, name, text, action, filterCount, primary }) => {
    const game = window.puzzlePickerScene?.sys.game;
    if (!game) return;
    const play = game.scene.getScene('PlayPuzzle');
    const scene = sceneKey ? game.scene.getScene(sceneKey) : play.sys.isActive() ? play : window.puzzlePickerScene;
    if (!scene?.sys.isActive()) return;
    const dialog = scene.children.list.find(({ type }) => type === 'rexDialog');
    const body = dialog?.getElement('content');
    const candidates = action ? dialog?.getElement('actions') : dialog?.getAllChildren() ?? scene.children.list;
    const clip = !action && body?.type === 'rexScrollablePanel' ? body.getBounds() : undefined;
    const control = candidates?.find((object) => (object.visible || clip) && object.input?.enabled
      && (name === undefined || object.name === name)
      && (text === undefined || object.text === text)
      && (filterCount === undefined || object.getData('filterCount') === filterCount)
      && (primary === undefined || object.getData('primary') === primary));
    if (!control) return;
    const bounds = control.getBounds();
    const camera = scene.cameras.main;
    const { left, top, width, height } = game.canvas.getBoundingClientRect();
    const scaleX = width / game.scale.gameSize.width;
    const scaleY = height / game.scale.gameSize.height;
    return {
      x: left + bounds.centerX * camera.zoom * scaleX,
      y: top + bounds.centerY * camera.zoom * scaleY,
      width: bounds.width * camera.zoom * scaleX,
      height: bounds.height * camera.zoom * scaleY,
      clip: clip && {
        x: left + clip.centerX * camera.zoom * scaleX,
        top: top + clip.top * camera.zoom * scaleY,
        bottom: top + clip.bottom * camera.zoom * scaleY,
      },
    };
  }, { sceneKey, name, text, action, filterCount, primary }, { timeout: 4000 }).then((handle) => handle.jsonValue());
}

async function clickControl(page, selector, touch = false) {
  let point = await uiControl(page, selector);
  if (point.clip && (point.y < point.clip.top || point.y > point.clip.bottom)) {
    const { x, top, bottom } = point.clip;
    const center = (top + bottom) / 2;
    await page.mouse.move(x, center);
    await page.mouse.wheel(0, (point.y - center) * 2);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    point = await uiControl(page, selector);
    assert.ok(point.y >= point.clip.top && point.y <= point.clip.bottom, 'The dialog control should be in view');
  }
  const { x, y } = point;
  // Phaser uses the camera's render list for hit testing.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

const pressHeader = (page, name, touch = false) => clickControl(page, { name }, touch);
const pressSetting = (page, text, touch = false) => clickControl(page, { sceneKey: 'Settings', text, action: text === 'Done' }, touch);
const pressAction = (page, text, touch = false) => clickControl(page, { text, action: true }, touch);

function waitForDialogClosed(page, sceneKey) {
  return page.waitForFunction((key) => {
    const scene = window.puzzlePickerScene.sys.game.scene.getScene(key);
    return !scene.sys.isActive() || !scene.children.list.some(({ type }) => type === 'rexDialog');
  }, sceneKey, { timeout: 4000 });
}

async function waitForFilterCount(page, filterCount) {
  await uiControl(page, { sceneKey: 'SelectPuzzle', name: 'Filters', filterCount });
  assert.ok(await page.evaluate((count) => {
    const { children } = window.puzzlePickerScene;
    const button = children.getByName('Filters').getBounds();
    return children.list.some((object) => object.type === 'Text' && object.visible && object.text === String(count)
      && button.contains(object.getBounds().centerX, object.getBounds().centerY));
  }, filterCount),
    `The Filters badge should render ${filterCount}`);
}

async function openGamePage(t, options) {
  const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
  t.after(() => server.close());
  const { port } = server.httpServer.address();
  const browser = await chromium.launch({
    channel: process.env.LIVE_JIGSAW_BROWSER ?? 'chrome',
    args: ['--enable-gpu', '--enable-unsafe-swiftshader'],
  });
  t.after(() => browser.close());

  const page = await browser.newPage(options);
  await page.addInitScript(() => {
    // Fix the game seed and the first attempt seed for known placement coordinates.
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    const seeds = [1_011_889, 233];
    crypto.getRandomValues = (values) => {
      values[0] = seeds.shift();
      if (seeds.length === 0) crypto.getRandomValues = getRandomValues;
      return values;
    };
    window.paintedText = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      window.paintedText.push(text);
      return fillText.call(this, text, ...args);
    };
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const canvas = page.locator('#game canvas');
  const waitForText = async (text) => {
    try {
      await page.waitForFunction((value) => window.paintedText.includes(value), text, { timeout: 4000 });
    } catch (error) {
      assert.deepEqual(errors, []);
      throw error;
    }
  };
  return { page, canvas, waitForText, errors, origin: `http://127.0.0.1:${port}` };
}

async function openPuzzle(t, options, path = currentSizesPuzzlePath, initPage) {
  if (path.startsWith(compactPuzzlePath)) {
    compactPuzzleBuild ??= build({
      base: '/compact-fixture/',
      logLevel: 'warn',
      build: {
        outDir: 'dist/compact-fixture',
        rollupOptions: { input: 'tests/fixtures/compact-puzzle.html' },
      },
    });
    await compactPuzzleBuild;
  }
  const { page, canvas, waitForText, errors, origin } = await openGamePage(t, options);
  await initPage?.(page);
  await page.goto(`${origin}${path}`);
  await waitForPicker(page);
  const press = (selector) => clickControl(page, selector, options.hasTouch);
  const clickDialog = async (dx, dy) => {
    // Phaser uses the camera's render list for hit testing.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const { x, y, width, height } = await canvas.boundingBox();
    const tap = options.hasTouch ? page.touchscreen.tap.bind(page.touchscreen) : page.mouse.click.bind(page.mouse);
    await tap(x + width / 2 + dx, y + height / 2 + dy);
  };
  const clickSetting = (text) => pressSetting(page, text, options.hasTouch);
  const setAllowLoosePiecesOnBoard = async (allow) => {
    await pressHeader(page, 'Settings', options.hasTouch);
    await pressSetting(page, allow ? 'Yes' : 'No', options.hasTouch);
    assert.equal((await readSave(page)).settings.allowLoosePiecesOnBoard, allow);
    await pressSetting(page, 'Done', options.hasTouch);
    await waitForDialogClosed(page, 'Settings');
    await page.waitForFunction(() => {
      const { game } = window.puzzlePickerScene.sys;
      return game.scene.getScenes(true).some((scene) => ['PlayPuzzle', 'SelectPuzzle'].includes(scene.sys.settings.key) && scene.input.enabled);
    });
  };
  const playSelection = async ({ size, pieceShape, connectorStyle, animationSpeed, challengeMode, pieceRotation } = {}) => {
    if (size) await press({ text: String(size) });
    if (pieceShape) await press({ name: pieceShape });
    if (connectorStyle) await press({ name: connectorStyle.toLowerCase(), text: '' });
    if (animationSpeed) await press({ text: animationSpeed });
    if (pieceRotation !== undefined) await press({ text: pieceRotation ? 'On' : 'Off' });
    if (challengeMode) await press(challengeMode === 'none' ? { name: 'none', text: 'None' } : { name: challengeMode });
    await press({ text: 'Play', action: true });
  };
  return { page, canvas, waitForText, errors, clickDialog, clickSetting, playSelection, setAllowLoosePiecesOnBoard };
}

async function openCompactPuzzle(t, options, path = compactPuzzlePath) {
  return openPuzzle(t, options, path);
}

async function playLayout(page) {
  await page.waitForFunction(() => window.puzzleArtworkScene?.sys.isActive());
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const layout = await page.evaluate(() => {
    const scene = window.puzzleArtworkScene.sys.game.scene.getScene('PlayPuzzle');
    const board = scene.cameras.getCamera('Puzzle board');
    const tray = scene.cameras.getCamera('Piece tray');
    const objects = scene.children.list;
    const divider = objects.find(({ input }) => ['ew-resize', 'ns-resize'].includes(input?.cursor));
    const trayLayer = objects.find((object) => object.type === 'Layer' && !(object.cameraFilter & tray.id));
    const boardLayer = objects.find((object) => object.type === 'Layer' && !(object.cameraFilter & board.id));
    const overlay = scene.cameras.getCamera('Board overlay');
    const overlayLayer = objects.find((object) => object.type === 'Layer' && !(object.cameraFilter & overlay.id));
    const iconButton = (name) => {
      const button = overlayLayer.list.find((object) => object.name === name);
      if (!button) return;
      const { x, y, width, height, visible } = button;
      return { x, y, width, height, visible, armed: button.getData('primary') };
    };
    return {
      divider: { x: divider.x, y: divider.y },
      board: { x: board.x, y: board.y, width: board.width, height: board.height, zoom: board.zoom },
      breakButton: iconButton('Break piece off'),
      moveTrayButton: iconButton('Move Tray to Board'),
      returnAllButton: iconButton('Return All Parked Pieces to Tray'),
      sortButton: iconButton('Sort Edge Pieces'),
      shuffleButton: iconButton('Shuffle Parked Pieces'),
      fitButton: iconButton('Fit board'),
      nativeSizeButton: iconButton('Native size (1×)'),
      artwork: { x: board.x - board.scrollX * board.zoom, y: board.y - board.scrollY * board.zoom },
      traySize: { width: tray.width, height: tray.height },
      parked: boardLayer.list.filter(({ frame, visible }) => visible && frame?.name.startsWith('piece-'))
        .map(({ frame, x, y, angle }) => ({ id: frame.name, x, y, angle })),
      parkedBorders: boardLayer.list.filter(({ name }) => name === 'Parked piece border')
        .map(({ x, y, angle, tint }) => ({ x, y, angle, tint })),
      liftedBorders: overlayLayer.list.filter(({ name }) => name === 'Parked piece border').length,
      liftShadows: overlayLayer.list.filter(({ name }) => name === 'Lift shadow')
        .map(({ x, y, angle }) => ({ x, y, angle })),
      tray: trayLayer.list.map(({ frame, x, y, displayWidth, displayHeight }) => ({
        id: frame.name, x, y, width: displayWidth, height: displayHeight,
      })),
    };
  });
  const { artwork, board } = layout;
  return {
    ...layout,
    boardPoint: (x, y) => ({ x: artwork.x + x * board.zoom, y: artwork.y + y * board.zoom }),
  };
}

function cellCenter(layout, column, row, size = compactSize) {
  return layout.boardPoint((column + 0.5) * size.width / size.columns,
    (row + 0.5) * size.height / size.rows);
}

function pieceTarget(layout, id, size) {
  const [, row, column] = id.split('-').map(Number);
  return cellCenter(layout, column, row, size);
}

async function assertStaticCapture(page, { width, height }) {
  await page.waitForFunction(() => window.puzzleArtworkScene?.sys.isActive());
  const { textureSize, artwork } = await page.evaluate(() => {
    const scene = window.puzzleArtworkScene;
    const [image] = scene.children.list;
    const texture = scene.textures.get('live-puzzle-output');
    return {
      textureSize: { width: texture.width, height: texture.height },
      artwork: {
        x: image.x, y: image.y, width: image.displayWidth, height: image.displayHeight,
        scaleX: image.scaleX, scaleY: image.scaleY,
      },
    };
  });
  assert.deepEqual(textureSize, { width, height });
  assert.deepEqual([artwork.x, artwork.y], [0, 0]);
  assert.equal(artwork.scaleX, artwork.scaleY);
  assert.ok(artwork.scaleX <= 1);
  assert.ok(Math.abs(width - artwork.width) < 1 && Math.abs(height - artwork.height) < 1);
}

async function dragDivider(page, drag, destination) {
  const { divider } = await playLayout(page);
  await drag(divider.x, divider.y, destination.x ?? divider.x, destination.y ?? divider.y);
}

function iconCenter(button) {
  assert.ok(button.visible, 'The icon should be visible');
  return [button.x + button.width / 2, button.y + button.height / 2];
}

async function pressIcon(page, button, touch = false) {
  const [x, y] = iconCenter(button);
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function countWorkspaceSaves(page) {
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    window.workspaceSaves = 0;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'live-jigsaw.save') window.workspaceSaves++;
      return setItem.call(this, key, value);
    };
  });
  return () => page.evaluate(() => window.workspaceSaves);
}

function assertCompactBoardControls(layout) {
  const { board } = layout;
  const buttons = [layout.breakButton, layout.moveTrayButton, layout.returnAllButton, layout.sortButton,
    layout.shuffleButton, layout.fitButton, layout.nativeSizeButton];
  for (const [index, button] of buttons.entries()) {
    assert.ok(button.visible);
    assert.equal(button.width, 54);
    assert.equal(button.height, 54);
    assert.ok(button.x >= board.x && button.x + button.width <= board.x + board.width,
      'Control must fit the board width');
    assert.ok(button.y >= board.y && button.y + button.height <= board.y + board.height, 'Control must fit the board height');
    for (const other of buttons.slice(0, index)) {
      assert.ok(button.x + button.width <= other.x || other.x + other.width <= button.x
        || button.y + button.height <= other.y || other.y + other.height <= button.y, 'Controls must not overlap');
    }
  }
}

scenario('board tools park, sort and shuffle with the mouse, and restore the shuffled positions', async (t) => {
  const { page, waitForText, errors, clickDialog, playSelection, setAllowLoosePiecesOnBoard } =
    await openCompactPuzzle(t, { viewport: { width: 1320, height: 780 } });
  await page.mouse.click(340, 180);
  await playSelection({ connectorStyle: 'None', pieceRotation: false });
  await waitForText('0 of 8 placed');
  let layout = await playLayout(page);
  assert.equal(layout.sortButton.visible, false);
  assert.equal(layout.moveTrayButton.visible, true);
  await setAllowLoosePiecesOnBoard(false);
  assert.equal((await playLayout(page)).moveTrayButton.visible, false);
  await setAllowLoosePiecesOnBoard(true);

  const saves = await countWorkspaceSaves(page);
  await pressIcon(page, (await playLayout(page)).moveTrayButton);
  layout = await playLayout(page);
  assert.equal(layout.moveTrayButton.visible, false);
  assert.equal(layout.tray.length, 0);
  assert.equal(layout.parked.length, 8);
  const parked = (await readSave(page)).progress.Windmill;
  assert.equal(parked.parkedGroups.length, 8);
  assert.deepEqual(parked.placedPieceIds, []);

  await pressIcon(page, layout.sortButton);
  assert.equal((await playLayout(page)).sortButton.armed, true);
  const center = layout.boardPoint(256, 144);
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, -300);
  await page.mouse.down();
  await page.mouse.move(center.x + 100, center.y + 95, { steps: 5 });
  await page.mouse.up();
  layout = await playLayout(page);
  assert.ok(layout.board.zoom > 1);
  assert.deepEqual((await readSave(page)).progress.Windmill, parked, 'Panning must not sort');
  const target = layout.boardPoint(256, 144);
  await page.mouse.click(target.x, target.y);
  const sorted = await playLayout(page);
  assert.deepEqual(sorted.artwork, layout.artwork, 'Sorting must not move the camera');
  assert.equal(sorted.sortButton.armed, false);
  const midrange = (axis) => {
    const values = sorted.parked.map((piece) => piece[axis]);
    return (Math.min(...values) + Math.max(...values)) / 2;
  };
  assert.ok(Math.abs(midrange('x') - 256) < 2 && Math.abs(midrange('y') - 144) < 2,
    'The bundle must center on the logical target after pan and zoom');
  assert.equal(await saves(), 2, 'Each tool should save once');

  await pressIcon(page, sorted.sortButton);
  layout = await playLayout(page);
  assert.equal(layout.sortButton.armed, true);
  await pressIcon(page, layout.shuffleButton);
  const shuffled = await playLayout(page);
  assert.equal(shuffled.sortButton.armed, false);
  assert.deepEqual(shuffled.artwork, layout.artwork, 'Shuffling must preserve pan');
  assert.equal(shuffled.board.zoom, layout.board.zoom, 'Shuffling must preserve zoom');
  assert.notDeepEqual(shuffled.parked, sorted.parked);
  assert.equal(await saves(), 3, 'Shuffling should save once');

  await page.reload();
  await waitForText('Windmill');
  await page.mouse.click(340, 180);
  await waitForText('Resume');
  await clickDialog(100, resumeActionY);
  layout = await playLayout(page);
  assert.deepEqual(layout.parked, shuffled.parked);
  const resumedSaves = await countWorkspaceSaves(page);
  await pressIcon(page, layout.returnAllButton);
  layout = await playLayout(page);
  assert.deepEqual(layout.parked, []);
  assert.equal(layout.tray.length, 8);
  assert.equal(await resumedSaves(), 1, 'A Return All click should save once');
  assert.deepEqual(errors, []);
});

scenario('touch board tools fit on compact screens and distinguish taps from pinch and cancellation', async (t) => {
  const { page, waitForText, errors, clickDialog } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true,
  });
  const parkedGroups = [
    { memberIds: ['piece-0-0', 'piece-0-1'], anchorPieceId: 'piece-0-0', position: { x: -150, y: 80 }, quarterTurns: 0 },
    { memberIds: ['piece-1-0'], anchorPieceId: 'piece-1-0', position: { x: 300, y: 300 }, quarterTurns: 0 },
  ];
  const placedPieceIds = ['piece-1-3'];
  await page.evaluate((save) => localStorage.setItem('live-jigsaw.save', JSON.stringify(save)), {
    version: saveVersion,
    progress: { Windmill: {
      setup: { size: compactSize, seed: 42, connectorStyle: 'none', animationSpeed: 'Normal', challengeMode: 'none', pieceRotation: false },
      placedPieceIds, trayOrientations: {}, parkedGroups,
    } },
  });
  await page.reload();
  await waitForText('Windmill');
  await page.touchscreen.tap(340, 180);
  await waitForText('Resume');
  await clickDialog(100, resumeActionY);
  await waitForText('1 of 8 placed');
  await page.setViewportSize({ width: 230, height: 680 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 230);
  const { dispatch } = await touchController(page);
  let layout = await playLayout(page);
  await pressIcon(page, layout.breakButton, true);
  layout = await playLayout(page);
  assert.equal(layout.breakButton.armed, true);
  await pressIcon(page, layout.sortButton, true);
  layout = await playLayout(page);
  assert.equal(layout.breakButton.armed, false);
  assert.equal(layout.sortButton.armed, true);

  const saves = await countWorkspaceSaves(page);
  const before = (await readSave(page)).progress.Windmill;
  const fittedZoom = layout.board.zoom;
  const y = layout.board.y + 245;
  await dispatch('touchStart', [95, y]);
  await dispatch('touchStart', [95, y], [175, y]);
  await dispatch('touchMove', [75, y], [195, y]);
  await dispatch('touchEnd');
  layout = await playLayout(page);
  assert.ok(layout.board.zoom > fittedZoom, 'The two contacts should zoom, not sort');
  assert.deepEqual((await readSave(page)).progress.Windmill, before);
  assert.equal(layout.board.width, 230);
  assertCompactBoardControls(layout);
  assert.ok(layout.shuffleButton.y > layout.breakButton.y, 'Parked tools should wrap');
  assert.ok(layout.fitButton.y >= layout.shuffleButton.y + layout.shuffleButton.height,
    'Zoom should wrap below both occupied tool rows when it cannot fit beside them');

  await page.setViewportSize({ width: 275, height: 680 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 275);
  layout = await playLayout(page);
  assert.equal(layout.board.width, 275);
  assertCompactBoardControls(layout);
  assert.equal(layout.fitButton.y, layout.shuffleButton.y, 'Zoom should share the last row when it fits');
  await pressIcon(page, layout.fitButton, true);
  const wideFit = await playLayout(page);
  assert.equal(wideFit.fitButton.visible, false);

  await page.setViewportSize({ width: 230, height: 680 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 230);
  layout = await playLayout(page);
  assert.equal(layout.board.width, 230, 'The board viewport should shrink without a tray-side change');
  assert.equal(layout.fitButton.visible, false, 'The board should stay fitted after shrinking');
  assert.ok(layout.board.zoom < wideFit.board.zoom, 'Fit should use the narrower width');
  const artworkCenter = layout.boardPoint(compactSize.width / 2, compactSize.height / 2);
  assert.ok(Math.abs(artworkCenter.x - 115) < 1, 'Fitted artwork should stay centered in the canvas');
  const shuffle = iconCenter(layout.shuffleButton);
  const pinchStart = [shuffle[0], y + 50];
  const zoomBeforePinch = layout.board.zoom;
  await dispatch('touchStart', pinchStart);
  await dispatch('touchStart', pinchStart, shuffle);
  await dispatch('touchMove', [pinchStart[0], pinchStart[1] + 30], shuffle);
  await dispatch('touchEnd');
  layout = await playLayout(page);
  assert.ok(layout.board.zoom > zoomBeforePinch, 'A second contact on Shuffle must still allow pinch');
  assertCompactBoardControls(layout);

  await dispatch('touchStart', iconCenter(layout.returnAllButton));
  await dispatch('touchCancel');
  layout = await playLayout(page);
  assert.deepEqual((await readSave(page)).progress.Windmill, before, 'Pinch and cancellation must not run a bulk tool');
  assert.equal(await saves(), 0);

  await pressIcon(page, layout.nativeSizeButton, true);
  layout = await playLayout(page);
  assert.equal(layout.board.zoom, 1);
  await pressIcon(page, layout.fitButton, true);
  layout = await playLayout(page);
  assert.equal(layout.fitButton.visible, false);

  await pressIcon(page, layout.sortButton, true);
  await dispatch('touchStart', [130, y]);
  await dispatch('touchCancel');
  layout = await playLayout(page);
  assert.equal(layout.sortButton.armed, false);
  assert.deepEqual((await readSave(page)).progress.Windmill, before);
  await pressIcon(page, layout.sortButton, true);
  await page.touchscreen.tap(130, y);
  layout = await playLayout(page);
  assert.equal(layout.sortButton.armed, false);
  const sorted = (await readSave(page)).progress.Windmill;
  assert.notDeepEqual(sorted.parkedGroups[1].position, before.parkedGroups[1].position);
  assert.deepEqual(sorted.parkedGroups[0].memberIds, parkedGroups[0].memberIds);
  await pressIcon(page, layout.moveTrayButton, true);
  layout = await playLayout(page);
  assert.equal(layout.moveTrayButton.visible, false);
  assert.equal((await readSave(page)).progress.Windmill.parkedGroups.length, 6);
  assert.equal(await saves(), 2);

  await pressIcon(page, layout.breakButton, true);
  layout = await playLayout(page);
  assert.equal(layout.breakButton.armed, true);
  await pressIcon(page, layout.shuffleButton, true);
  layout = await playLayout(page);
  assert.equal(layout.breakButton.armed, false);
  assert.equal(await saves(), 3, 'A Shuffle tap should save once');

  await pressIcon(page, layout.sortButton, true);
  layout = await playLayout(page);
  assert.equal(layout.sortButton.armed, true);
  await pressIcon(page, layout.returnAllButton, true);
  const returned = await playLayout(page);
  assert.equal(returned.sortButton.armed, false);
  assert.equal(returned.returnAllButton.visible, false);
  assert.equal(returned.shuffleButton.visible, false);
  assert.equal(returned.parked.length, 0);
  assert.equal(returned.tray.length, 7);
  assert.equal(await saves(), 4, 'A Return All tap should save once');
  assert.deepEqual((await readSave(page)).progress.Windmill.placedPieceIds, placedPieceIds);

  await page.setViewportSize({ width: 1320, height: 780 });
  await page.reload();
  await waitForText('Windmill');
  await page.touchscreen.tap(340, 180);
  await waitForText('Resume');
  await clickDialog(100, resumeActionY);
  await waitForText('1 of 8 placed');
  layout = await playLayout(page);
  assert.deepEqual(layout.parked, []);
  assert.deepEqual(layout.tray.map(({ id }) => id), returned.tray.map(({ id }) => id));
  assert.deepEqual(errors, []);
});

scenario('Sequential bulk-parked pieces stay gated even when they overlap the active piece', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } =
    await openCompactPuzzle(t, { viewport: { width: 1320, height: 780 } });
  await page.mouse.click(340, 180);
  await playSelection({ connectorStyle: 'None', challengeMode: 'sequential', pieceRotation: false });
  await waitForText('0 of 8 placed');
  let layout = await playLayout(page);
  const [active, gated] = layout.tray;
  await pressIcon(page, layout.moveTrayButton);
  assert.equal((await playLayout(page)).parked.length, 8);

  // Recreate the overlap fallback with the gated piece drawn above the active one.
  const overlap = { x: 256, y: 0 };
  await page.evaluate(({ active, gated, overlap }) => {
    const key = 'live-jigsaw.save';
    const save = JSON.parse(localStorage.getItem(key));
    const progress = save.progress.Windmill;
    const groups = progress.parkedGroups.filter(({ anchorPieceId }) => ![active, gated].includes(anchorPieceId));
    progress.parkedGroups = [...groups, ...[active, gated].map((id) => ({
      anchorPieceId: id, memberIds: [id], quarterTurns: 0, position: overlap,
    }))];
    localStorage.setItem(key, JSON.stringify(save));
  }, { active: active.id, gated: gated.id, overlap });
  await page.reload();
  await waitForText('Windmill');
  await page.mouse.click(340, 180);
  await waitForText('Resume');
  await clickDialog(100, resumeActionY);
  layout = await playLayout(page);
  const start = layout.boardPoint(overlap.x, overlap.y);
  const target = pieceTarget(layout, active.id);
  const sample = async () => pixelAt(page, await canvas.screenshot(), start.x, start.y);
  const [red, green, blue] = await sample();
  assert.equal(red, green);
  assert.equal(green, blue, 'The gated parked piece on top should be grayscale');

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  await waitForText('1 of 8 placed');
  assert.deepEqual((await readSave(page)).progress.Windmill.placedPieceIds, [active.id]);
  const [nextRed, nextGreen] = await sample();
  assert.notEqual(nextRed, nextGreen, 'The newly eligible parked piece should regain its color');
  assert.deepEqual(errors, []);
});

scenario('the play workspace fills the viewport beneath the padded header', async (t) => {
  const { page, waitForText, errors, playSelection } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true,
  });
  await page.touchscreen.tap(340, 180);
  await playSelection();
  await waitForText('0 of 8 placed');
  const measure = () => page.evaluate(() => {
    const scene = window.puzzleArtworkScene.sys.game.scene.getScene('PlayPuzzle');
    const objects = scene.children.list;
    const heading = objects.find(({ text }) => text === 'Windmill');
    const progress = objects.find(({ text }) => text === '0 of 8 placed');
    const controls = ['All puzzles', 'Settings', 'Artwork details'].map((name) => scene.children.getByName(name));
    const headerBounds = [heading, progress, ...controls].map((object) => object.getBounds());
    const top = Math.min(...headerBounds.map(({ top }) => top));
    const bottom = Math.max(...headerBounds.map(({ bottom }) => bottom));
    const [tray, board] = objects.filter(({ type, depth }) => type === 'Rectangle' && depth === -1)
      .map((panel) => panel.getBounds());
    return {
      top, below: Math.min(board.y, tray.y) - bottom, titleAboveProgress: heading.y < progress.y,
      left: Math.min(board.x, tray.x), right: Math.max(board.x + board.width, tray.x + tray.width),
      bottom: Math.max(board.y + board.height, tray.y + tray.height),
    };
  });
  assert.deepEqual(await measure(), { top: 16, below: 16, titleAboveProgress: true, left: 0, right: 1320, bottom: 780 });
  await page.setViewportSize({ width: 460, height: 820 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 460);
  assert.deepEqual(await measure(), { top: 16, below: 16, titleAboveProgress: true, left: 0, right: 460, bottom: 820 });
  assert.deepEqual(errors, []);
});

scenario('play opens artwork details and the active challenge rules without changing progress', async (t) => {
  const { page, errors, waitForText, playSelection } = await openCompactPuzzle(t, {
    viewport: { width: 460, height: 780 }, hasTouch: true, isMobile: true,
  });
  await page.touchscreen.tap(230, 180);
  await playSelection({ challengeMode: 'sequential' });
  await waitForText('0 of 8 placed');
  const originalSave = await readSave(page);
  const playInfo = () => page.evaluate(() => {
    const { scene } = window.puzzlePickerScene.sys.game;
    const play = scene.getScene('PlayPuzzle');
    const info = scene.getScene('PlayInfo');
    const dialog = info.children.list.find(({ type }) => type === 'rexDialog');
    return {
      boardInputEnabled: play.input.enabled,
      artwork: dialog.getElement('title').type === 'Image',
      description: dialog.getElement('content').text,
      progress: dialog.getElement('actionsSizer.footerLabel')?.text,
    };
  });
  const dismiss = async () => {
    await clickControl(page, { sceneKey: 'PlayInfo', text: 'Close', action: true }, true);
    await waitForDialogClosed(page, 'PlayInfo');
    await page.waitForFunction(() => window.puzzlePickerScene.sys.game.scene.getScene('PlayPuzzle').input.enabled);
  };

  await uiControl(page, { name: 'Artwork details', text: '· Me' });
  await pressHeader(page, 'Artwork details', true);
  await waitForText('Artwork credits');
  const details = await playInfo();
  assert.equal(details.artwork, true);
  assert.equal(details.progress, '0 of 8 placed');
  assert.equal(details.boardInputEnabled, false);
  await dismiss();

  await pressHeader(page, 'Challenge rules', true);
  await waitForText('Sequential challenge');
  const rules = await playInfo();
  assert.equal(rules.boardInputEnabled, false);
  assert.match(rules.description, /only one piece is unlocked at a time/i);
  await dismiss();
  assert.deepEqual(await readSave(page), originalSave);
  assert.deepEqual(errors, []);
});

scenario('the board keeps fixed pan bounds through zoom with a parked piece', async (t) => {
  const { page, waitForText, errors, playSelection } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true,
  });
  await page.touchscreen.tap(340, 180);
  await playSelection({ pieceRotation: false, challengeMode: 'none' });
  await waitForText('0 of 8 placed');

  const { moveFinger } = await touchController(page);
  const fitted = await playLayout(page);
  const { x, y, width, height } = fitted.board;
  const center = { x: x + width / 2, y: y + height / 2 };
  const piece = fitted.tray[0];
  await moveFinger(piece.x, piece.y, x + 75, piece.y);
  const parked = (await playLayout(page)).parked;
  assert.equal(parked.length, 1);
  assert.ok(parked[0].x < 0, 'The piece should be parked outside the guide');

  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, 2000);
  const zoomedOut = await playLayout(page);
  assert.equal(zoomedOut.board.zoom, 0.5);
  const { width: guideWidth, height: guideHeight } = compactSize;
  const assertNear = (actual, expected, label) => {
    assert.ok(Math.abs(actual - expected) < 1, `${label}: expected ${expected}, got ${actual}`);
  };
  const verticalTravel = height / 2 - 75; // Start below the board toolbar.
  const pan = (horizontal, vertical) => moveFinger(
    center.x - horizontal * (width / 2 - 30), center.y - vertical * verticalTravel,
    center.x + horizontal * (width / 2 - 30), center.y + vertical * verticalTravel,
  );
  for (const [dx, dy, cornerX, cornerY] of [
    [1, 1, 0, 0], [-1, 0, guideWidth, 0], [1, -1, 0, guideHeight], [-1, 0, guideWidth, guideHeight],
  ]) {
    await pan(dx, dy);
    const corner = (await playLayout(page)).boardPoint(cornerX, cornerY);
    assertNear(corner.x, center.x, 'Corner x at minimum zoom');
    assertNear(corner.y, center.y, 'Corner y at minimum zoom');
  }

  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, -2000);
  for (let i = 0; i < 3; i++) await pan(-1, -1);
  const panned = await playLayout(page);
  assert.equal(panned.board.zoom, 2.5);
  const corner = panned.boardPoint(guideWidth, guideHeight);
  assertNear(x + width - corner.x, width * panned.board.zoom / (2 * zoomedOut.board.zoom), 'Fixed right boundary');
  assertNear(y + height - corner.y, height * panned.board.zoom / (2 * zoomedOut.board.zoom), 'Fixed bottom boundary');
  assert.ok(corner.x < x && corner.y < y, 'The guide should be fully outside the viewport');

  const fit = panned.fitButton;
  assert.equal(fit.visible, true);
  await page.touchscreen.tap(fit.x + fit.width / 2, fit.y + fit.height / 2);
  const restored = await playLayout(page);
  assert.deepEqual(restored.board, fitted.board);
  assert.deepEqual(restored.artwork, fitted.artwork);
  assert.deepEqual(restored.parked, parked);
  assert.deepEqual(errors, []);
});

scenario('picker preview sizes reflow the cards, persist and stay left aligned on touch screens', async (t) => {
  const { page, waitForText, errors } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true,
  });
  assert.ok(!await page.evaluate(() => window.paintedText.includes('Select a Puzzle')));

  const pickerLayout = () => page.evaluate(() => {
    const { children } = window.puzzlePickerScene;
    const panel = children.list.find(({ type }) => type === 'rexScrollablePanel');
    const grid = panel.getElement('panel.cards');
    const [card] = grid.getElement('items');
    const options = children.list.filter(({ name }) => name.startsWith('preview-size-')).map((tile) => {
      return {
        size: tile.name.slice('preview-size-'.length), x: tile.x, y: tile.y, left: tile.getBounds().left,
        selected: tile.getElement('background').lineWidth === 2,
        icon: Boolean(tile.getElement('icon')), text: Boolean(tile.getElement('text')),
      };
    });
    const [title] = card.getChildren().filter(({ type }) => type === 'Text');
    return {
      options, columns: grid.columnCount, width: card.width, height: card.height, panelTop: panel.y,
      titleStyle: title.style.fontStyle,
    };
  });
  const assertSelection = (layout, size) => {
    assert.deepEqual(layout.options.filter(({ selected }) => selected).map((option) => option.size), [size]);
  };
  const full = await pickerLayout();
  assert.deepEqual(full.options.map(({ size }) => size), ['Compact', 'Full']);
  assertSelection(full, 'Full');
  assert.ok(full.options.every(({ icon, text }) => icon && !text));
  assert.equal(full.options[0].left, 24);
  assert.equal(full.columns, 2);
  assert.equal(full.width, 560);
  assert.equal(full.titleStyle, 'bold');

  await page.mouse.click(full.options[0].x, full.options[0].y);
  const compact = await pickerLayout();
  assertSelection(compact, 'Compact');
  assert.equal(compact.columns, 5);
  assert.equal(compact.width, 200);
  assert.equal(compact.titleStyle, 'bold');
  assert.ok(compact.height < full.height);

  await page.reload();
  await waitForPicker(page);
  assert.deepEqual(await pickerLayout(), compact);

  const save = await readSave(page);
  const previous = { ...save, version: 11, settings: { ...save.settings, pickerPreviewSize: 'Medium' } };
  await page.evaluate((value) => localStorage.setItem('live-jigsaw.save', JSON.stringify(value)), previous);
  await page.reload();
  await waitForPicker(page);
  assert.deepEqual(await pickerLayout(), compact);
  assert.deepEqual(await readSave(page), save);

  await page.setViewportSize({ width: 375, height: 640 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 375);
  const portrait = await pickerLayout();
  assertSelection(portrait, 'Compact');
  assert.equal(portrait.width, 148);
  assert.equal(portrait.columns, 2);
  assert.equal(portrait.options[0].left, 24);
  assert.ok(portrait.options.every(({ x, y }) => x > 0 && x < 375 && y < portrait.panelTop));
  await page.touchscreen.tap(portrait.options[1].x, portrait.options[1].y);
  const portraitFull = await pickerLayout();
  assertSelection(portraitFull, 'Full');
  assert.ok(portraitFull.width > portrait.width);
  await page.reload();
  await waitForPicker(page);
  assert.deepEqual(await pickerLayout(), portraitFull);
  await page.touchscreen.tap(175, portraitFull.panelTop + 70);
  await waitForText('Piece count');
  assert.deepEqual(errors, []);
});

scenario('the touch picker stays usable while the viewport width changes', async (t) => {
  const { page, waitForText, errors } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const { moveFinger } = await touchController(page);
  await moveFinger(350, 550, 350, 240);

  const resize = async (width) => {
    await page.setViewportSize({ width, height: 780 });
    await page.waitForFunction((width) => document.querySelector('canvas').width === width, width);
    assert.deepEqual(errors, [], `Resizing the touch viewport to ${width}px should not throw`);
  };
  const widths = [1319, 1299, 1255, 1240, 1201, 1024, 801, 680, 559, 480, 390, 320, 280, 560, 760, 1241, 1320];
  for (const width of widths) await resize(width);

  await pressHeader(page, 'Filters', true);
  await waitForText('Type');
  for (const width of widths) await resize(width);
  await page.keyboard.press('Escape');
  await waitForDialogClosed(page, 'SelectPuzzle');

  await pressHeader(page, 'Settings', true);
  await waitForText('Allow loose pieces on board');
  assert.deepEqual(errors, []);
});

scenario('a touch scrollbar survives a resize that leaves no thumb travel', async (t) => {
  const { page, waitForText, errors } = await openPuzzle(t, {
    viewport: { width: 680, height: 200 }, hasTouch: true, isMobile: true,
  });
  const { dispatch } = await touchController(page);
  await dispatch('touchStart', [675, 155]);
  await dispatch('touchMove', [675, 177]);
  for (const height of [160, 142, 130, 122, 120, 116, 114, 112, 110, 106, 100]) {
    await page.setViewportSize({ width: 680, height });
    await page.waitForFunction((height) => document.querySelector('canvas').height === height, height);
    await dispatch('touchMove', [675, 101]);
    await dispatch('touchMove', [675, 106]);
    assert.deepEqual(errors, [], `Resizing during a scrollbar drag to ${height}px should not throw`);
  }
  await dispatch('touchEnd');
  await page.setViewportSize({ width: 680, height: 780 });
  await page.waitForFunction(() => document.querySelector('canvas').height === 780);
  await pressHeader(page, 'Settings', true);
  await waitForText('Allow loose pieces on board');
  assert.deepEqual(errors, []);
});

scenario('picker scrollbar sync does not feed changes back into the panel', async (t) => {
  const { page, errors } = await openCompactPuzzle(t, {
    viewport: { width: 680, height: 780 }, hasTouch: true, isMobile: true,
  });
  await page.setViewportSize({ width: 559, height: 780 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 559);

  const result = await page.evaluate(() => {
    const panel = window.puzzlePickerScene.children.list.find(({ type }) => type === 'rexScrollablePanel');
    const { slider, scroller } = panel.childrenMap;
    let scrollEvents = 0;
    panel.on('scroll', () => scrollEvents++);

    panel.setChildOY(panel.bottomChildOY / 2);
    const eventsAfterSync = scrollEvents;
    slider.setValue(NaN);
    scroller.setValue(NaN);
    const valueAfterInvalidInput = {
      panel: panel.t, slider: slider.value, scroller: scroller.value / panel.bottomChildOY,
    };

    slider.setValue(0.75);
    const valueAfterSliderInput = panel.t;
    scroller.setValue(panel.bottomChildOY / 4);
    return { eventsAfterSync, valueAfterInvalidInput, valueAfterSliderInput, finalValue: panel.t, scrollEvents };
  });
  assert.deepEqual(result, {
    eventsAfterSync: 0, valueAfterInvalidInput: { panel: 0.5, slider: 0.5, scroller: 0.5 },
    valueAfterSliderInput: 0.75, finalValue: 0.25, scrollEvents: 2,
  });
  assert.deepEqual(errors, []);
});

scenario('the picker shows newest puzzles first and only loads nearby previews', async (t) => {
  const { page, canvas, waitForText, errors, origin } = await openGamePage(t, {
    viewport: { width: 768, height: 1024 },
    reducedMotion: 'reduce',
  });
  const gameScript = /\/assets\/index-[\w-]+\.js$/;
  const staticArtwork = /\/assets\/(?:cherry-blossoms-on-branch|gray-panther|jungle-rhinos)-[\w-]+\.png$/;
  const previewAsset = /\/assets\/(?:preview-[\w-]+\.png|(?:cherry-blossoms|gray-panther|jungle-rhinos)-preview-[\w-]+\.jpg)$/;
  const requestedArtwork = [];
  const requestedPreviews = [];
  const scriptGate = Promise.withResolvers();
  const previewGate = Promise.withResolvers();
  page.on('request', (request) => {
    if (staticArtwork.test(request.url())) requestedArtwork.push(request.url());
  });
  await page.route(gameScript, async (route) => {
    await scriptGate.promise;
    await route.continue();
  }, { times: 1 });
  await page.route(previewAsset, async (route) => {
    requestedPreviews.push(route.request().url());
    await previewGate.promise;
    await route.continue();
  });

  const status = page.getByRole('status');
  try {
    await page.goto(origin, { waitUntil: 'commit' });
    await status.waitFor({ state: 'visible' });
    assert.equal(await status.textContent().then((text) => text.trim()), 'Loading Live Jigsaw…');
    assert.equal(await status.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(0, 0, 0)');
    assert.equal(await canvas.count(), 0);

    const spinner = status.locator('[aria-hidden="true"]');
    assert.equal(await spinner.evaluate((element) => getComputedStyle(element).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await spinner.evaluate((element) => getComputedStyle(element).animationName), 'startup-spin');

    const firstCardRequested = page.waitForRequest(/\/assets\/jungle-rhinos(?:-preview)?-[\w-]+\.(?:png|jpg)$/, { timeout: 4000 });
    scriptGate.resolve();
    await status.waitFor({ state: 'detached', timeout: 4000 });
    await firstCardRequested;
    assert.deepEqual(requestedArtwork, [], 'The picker must not request full-size static artwork');
    const placeholder = [48, 69, 63, 255];
    const topPreview = async () => pixelAt(page, await canvas.screenshot(), 380, 220);
    assert.deepEqual(await topPreview(), placeholder, 'A pending preview should leave the card in place');
    assert.ok(requestedPreviews.length >= 3 && requestedPreviews.length <= 4,
      `Expected only previews near the top, got ${requestedPreviews.length}`);
    previewGate.resolve();
    let artwork = await topPreview();
    for (let frame = 0; frame < 30 && artwork.every((channel, i) => channel === placeholder[i]); frame++) {
      artwork = await topPreview();
    }
    assert.notDeepEqual(artwork, placeholder, 'The preview should appear in the same card when it loads');
    const expectPuzzleAt = async (y, title, countHeading = 'Piece count') => {
      await page.evaluate(() => { window.paintedText = []; });
      await page.mouse.click(380, y);
      await waitForText(countHeading);
      await waitForText(title);
      await page.keyboard.press('Escape');
    };
    await expectPuzzleAt(220, 'Jungle Rhinos', 'Target piece count');
    await expectPuzzleAt(610, 'Gray Panther', 'Target piece count');
    await page.mouse.move(380, 400);
    await page.mouse.wheel(0, 30000);
    await canvas.screenshot();
    await expectPuzzleAt(780, 'Windmill');
    await page.mouse.wheel(0, -30000);
    assert.deepEqual(await topPreview(), artwork);
    assert.equal(new Set(requestedPreviews).size, requestedPreviews.length, 'Revisited cards should reuse their preview');
    assert.deepEqual(requestedArtwork, [], 'Opening options and scrolling must not load full-size static artwork');
    assert.deepEqual(errors, []);
  } finally {
    scriptGate.resolve();
    previewGate.resolve();
  }
});

scenario('the Flowers and Static filters open Cherry Blossoms with an adaptive cut that survives reload', async (t) => {
  const { page, waitForText, errors, clickDialog } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true,
  });
  const { moveFinger } = await touchController(page);
  await waitForText('Flowers · Flat Illustration');
  await pressHeader(page, 'Filters', true);
  await waitForText('Artwork motion');
  await clickDialog(93, filterY.secondTheme); // Flowers
  await clickDialog(-60, filterY.motion); // Static
  await clickDialog(125, filterY.action); // Apply
  await waitForFilterCount(page, 2);
  await page.touchscreen.tap(900, 430);
  await waitForText('Artwork credits');
  await waitForText('Umme Hani Ali');
  const paintedCredits = await page.evaluate(() => window.paintedText.join(''));
  assert.ok(paintedCredits.includes('https://unsplash.com/illustrations/pink-cherry-blossoms-on-branch--a5OyxkF24g'));
  assert.ok(paintedCredits.includes('https://unsplash.com/@ummehaniali_22/illustrations'));
  await page.keyboard.press('Escape');

  await page.touchscreen.tap(660, 220);
  await waitForText('Target piece count');
  await waitForText('48 pieces · 6 × 8');
  assert.ok(!await page.evaluate(() => window.paintedText.includes('Animation speed')));
  await clickControl(page, { text: '420' }, true);
  await waitForText('456 pieces · 19 × 24');
  await clickControl(page, { name: 'square' }, true);
  await waitForText('459 pieces · 17 × 27');
  await clickControl(page, { name: 'none', text: '' }, true);
  await pressAction(page, 'Play', true);
  await waitForText('0 of 459 placed');

  const size = { width: 1043, height: 1649, columns: 17, rows: 27, snapTolerance: 16 };
  const layout = await playLayout(page);
  await assertStaticCapture(page, size);
  const piece = layout.tray[0];
  const target = pieceTarget(layout, piece.id, size);
  await moveFinger(piece.x, piece.y, target.x, target.y);
  await waitForText('1 of 459 placed');
  const save = await readSave(page);
  assert.equal(save.recentOptions.pieceCount, 420);
  assert.deepEqual(save.progress.CherryBlossoms.setup.size, size);

  const resume = async (savedSize) => {
    await page.reload();
    await waitForPicker(page);
    await pressHeader(page, 'Filters', true);
    await waitForText('Artwork motion');
    await clickDialog(93, filterY.secondTheme); // Flowers
    await clickDialog(-60, filterY.motion);
    await clickDialog(125, filterY.action);
    await waitForFilterCount(page, 2);
    await page.touchscreen.tap(660, 220);
    await waitForText('Resume');
    await page.evaluate(() => { window.paintedText = []; });
    await clickDialog(100, resumeActionY);
    await waitForText('1 of 459 placed');
    await assertStaticCapture(page, savedSize);
  };
  await resume(size);

  const originalSize = { ...size, width: 1200, height: 1897 };
  save.progress.CherryBlossoms.setup.size = originalSize;
  await page.evaluate((data) => localStorage.setItem('live-jigsaw.save', JSON.stringify(data)), save);
  await resume(originalSize);
  assert.deepEqual(errors, []);
});

for (const { title, key, cardX, width, height, columns, rows } of [
  { title: 'Gray Panther', key: 'GrayPanther', cardX: 360, width: 723, height: 1024, columns: 6, rows: 7 },
  { title: 'Jungle Rhinos', key: 'JungleRhinos', cardX: 940, width: 860, height: 860, columns: 8, rows: 6 },
]) {
  scenario(`${title} opens from the Wildlife filter and plays at the target area`, async (t) => {
    const { page, waitForText, errors, clickDialog } = await openPuzzle(t, {
      viewport: { width: 1320, height: 780 },
    });
    await pressHeader(page, 'Filters');
    await waitForText('Wildlife');
    await clickDialog(-119, filterY.firstTheme + 4 * 62); // Wildlife
    await clickDialog(-60, filterY.motion); // Static
    await clickDialog(125, filterY.action);
    await waitForFilterCount(page, 2);

    if (key === 'GrayPanther') {
      await page.mouse.click(600, 430);
      await waitForText('Swipe 👋😍');
      const credits = await page.evaluate(() => window.paintedText.join(''));
      assert.ok(credits.includes('https://unsplash.com/@swipe9/illustrations'));
      assert.ok(credits.includes('abstract-gray-background-gSR-qSYfJmc'));
      await page.keyboard.press('Escape');
    }

    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(cardX, 220);
    await waitForText(title);
    await waitForText(`${columns * rows} pieces · ${columns} × ${rows}`);
    const artwork = new RegExp(`/${key === 'GrayPanther' ? 'gray-panther' : 'jungle-rhinos'}-[^/]+\\.png$`);
    const releaseArtwork = Promise.withResolvers();
    t.after(() => releaseArtwork.resolve());
    await page.route(artwork, async (route) => {
      await releaseArtwork.promise;
      await route.continue();
    }, { times: 1 });
    await pressAction(page, 'Play');
    await waitForText(`0 of ${columns * rows} placed`);
    await waitForPuzzleLoading(page);
    releaseArtwork.resolve();
    await waitForPuzzleArtwork(page);
    const layout = await playLayout(page);
    const size = { width, height, columns, rows, snapTolerance: 28 };
    await assertStaticCapture(page, size);
    const piece = layout.tray[0];
    const target = pieceTarget(layout, piece.id, size);
    await page.mouse.move(piece.x, piece.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
    await waitForText(`1 of ${columns * rows} placed`);
    assert.deepEqual((await readSave(page)).progress[key].setup.size, size);
    assert.deepEqual(errors, []);
  });
}

function trackPieceMaskDraws(page) {
  return page.addInitScript(() => {
    // Count actual mask draws, which camera clipping alone does not prevent.
    const maskPrograms = new WeakSet();
    const activeMasks = new WeakMap();
    let maskDraws = 0;
    let repeatingMasks = 0;
    for (const { prototype } of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const { getUniformLocation, useProgram } = prototype;
      prototype.getUniformLocation = function (program, name) {
        if (name === 'uMaskSampler') maskPrograms.add(program);
        return getUniformLocation.call(this, program, name);
      };
      prototype.useProgram = function (program) {
        activeMasks.set(this, maskPrograms.has(program));
        return useProgram.call(this, program);
      };
      for (const method of ['drawArrays', 'drawElements']) {
        const draw = prototype[method];
        prototype[method] = function (...args) {
          if (activeMasks.get(this)) {
            maskDraws++;
            const activeUnit = this.getParameter(this.ACTIVE_TEXTURE);
            this.activeTexture(this.TEXTURE1); // Phaser binds the mask on unit 1.
            const wrapS = this.getTexParameter(this.TEXTURE_2D, this.TEXTURE_WRAP_S);
            const wrapT = this.getTexParameter(this.TEXTURE_2D, this.TEXTURE_WRAP_T);
            this.activeTexture(activeUnit);
            if (wrapS !== this.CLAMP_TO_EDGE || wrapT !== this.CLAMP_TO_EDGE) repeatingMasks++;
          }
          return draw.apply(this, args);
        };
      }
    }
    window.inspectPieceMaskDraws = () => new Promise((resolve) => requestAnimationFrame(() => {
      maskDraws = repeatingMasks = 0;
      requestAnimationFrame(() => resolve({ maskDraws, repeatingMasks }));
    }));
  });
}

scenario('the board starts fitted to the space left by the saved tray width', async (t) => {
  const { page, canvas, waitForText, errors, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  }, currentSizesPuzzlePath, (page) => page.addInitScript(() => {
    localStorage.setItem('live-jigsaw.save', JSON.stringify({
      version: 6,
      settings: { trayPosition: 'Left', trayFractions: { vertical: 0.4, horizontal: 0 } },
    }));
  }));
  await page.mouse.click(340, 180);
  await playSelection({ size: 420 });
  await waitForText('0 of 420 placed');
  assert.equal((await readSave(page)).recentOptions.pieceShape, 'vertical-short');

  const screenshot = await canvas.screenshot();
  const panelBackground = [32, 46, 42, 255];
  assert.deepEqual(await pixelAt(page, screenshot, 490, 700), [52, 66, 62, 255], 'The saved tray width should be restored');
  assert.deepEqual(await pixelAt(page, screenshot, 900, 180), panelBackground, 'The artwork should fit vertically after restoring the tray');
  assert.notDeepEqual(await pixelAt(page, screenshot, 900, 250), panelBackground, 'The fitted artwork should be visible');
  assert.deepEqual(await pixelAt(page, screenshot, 900, 700), panelBackground, 'The artwork should be centered vertically');
  assert.notDeepEqual(await pixelAt(page, screenshot, 1291, 103), panelBackground, 'The 1× button should occupy the top-right slot');
  assert.deepEqual(await pixelAt(page, screenshot, 1241, 103), panelBackground, 'Only one zoom button should be visible');
  assert.deepEqual(errors, []);
});

scenario('the 1× board button restores native size and Fit board returns to the fitted view', async (t) => {
  const { page, canvas, waitForText, errors, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true,
  }, currentSizesPuzzlePath, (page) => page.addInitScript(() => {
    localStorage.setItem('live-jigsaw.save', JSON.stringify({
      version: 8,
      settings: { trayPosition: 'Left', trayFractions: { vertical: 0.4, horizontal: 0 } },
    }));
  }));
  await page.touchscreen.tap(340, 180);
  await playSelection({ size: 40, pieceShape: 'vertical-short' });
  await waitForText('0 of 40 placed');

  const panelBackground = [32, 46, 42, 255];
  const [leftSlot, rightSlot, buttonY] = [1223, 1285, 121];
  const fitted = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, fitted, 900, 112), panelBackground);
  assert.deepEqual(await pixelAt(page, fitted, leftSlot, buttonY), panelBackground, 'A lone button should not occupy the left slot');
  await page.touchscreen.tap(rightSlot, buttonY);

  const native = await canvas.screenshot();
  // The 624 px artwork is centered between y=86 and y=780, so it spans y=121 to y=745 at 1×.
  for (const y of [117, 749]) assert.deepEqual(await pixelAt(page, native, 900, y), panelBackground);
  for (const y of [125, 741]) assert.notDeepEqual(await pixelAt(page, native, 900, y), panelBackground);

  const { moveFinger } = await touchController(page);
  await moveFinger(900, 420, 900, 460);
  const panned = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, panned, 900, 112), panelBackground, 'The artwork should move down');
  assert.deepEqual(await pixelAt(page, panned, leftSlot, buttonY), panelBackground, 'Panning at 1× should not show the native size button');
  assert.notDeepEqual(await pixelAt(page, panned, rightSlot, buttonY), panelBackground, 'Fit should remain available after panning');

  await page.mouse.move(900, 433);
  await page.mouse.wheel(0, 200);
  const zoomedOut = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, zoomedOut, leftSlot, buttonY), panelBackground, '1× should move to the left slot');
  assert.notDeepEqual(await pixelAt(page, zoomedOut, rightSlot, buttonY), panelBackground, 'Fit should stay in the right slot');
  await page.touchscreen.tap(leftSlot, buttonY);
  const nativeAgain = await canvas.screenshot();
  for (const y of [130, 155, 180]) {
    assert.deepEqual(await pixelAt(page, nativeAgain, 900, y), await pixelAt(page, panned, 900, y),
      'Zooming out and back to 1× should restore the panned artwork edge');
  }

  await page.touchscreen.tap(rightSlot, buttonY);
  const refitted = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, refitted, 900, 112), panelBackground);
  assert.deepEqual(await pixelAt(page, refitted, leftSlot, buttonY), panelBackground);
  assert.deepEqual(errors, []);
});

scenario('the 420-piece tray only draws nearby piece masks', async (t) => {
  const { page, waitForText, errors, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  }, currentSizesPuzzlePath, trackPieceMaskDraws);
  await page.mouse.click(340, 180);
  for (const count of ['40', '72', '144', '300', '420']) await waitForText(count);
  assert.ok(!(await page.evaluate(() => window.paintedText)).includes('8'));
  await playSelection({ size: 420, pieceShape: 'square', connectorStyle: 'Classic' });
  await waitForText('0 of 420 placed');

  const assertMaskDraws = async () => {
    const { maskDraws, repeatingMasks } = await page.evaluate(() => window.inspectPieceMaskDraws());
    assert.ok(maskDraws > 1 && maskDraws < 16, `Expected only visible tray masks, got ${maskDraws} draws`);
    assert.equal(repeatingMasks, 0, 'Piece cutouts should not sample the opposite edge of their masks');
  };
  await assertMaskDraws();
  await page.mouse.move(85, 140);
  await page.mouse.wheel(0, 30000);
  await assertMaskDraws();
  assert.deepEqual(errors, []);
});

scenario('a parking-only 420-piece save resumes across tablet orientations and rejects overlapping homes', async (t) => {
  const portrait = { width: 680, height: 860 };
  const landscape = { width: 1024, height: 768 };
  const { page, waitForText, errors, clickDialog, playSelection, setAllowLoosePiecesOnBoard } = await openCompactPuzzle(t, {
    viewport: portrait, hasTouch: true, isMobile: true,
  }, `${compactPuzzlePath}?currentSizes`);
  const { dispatch, moveFinger } = await touchController(page);
  const getAttempt = async () => (await readSave(page)).progress.Windmill;
  await page.touchscreen.tap(350, 180);
  await playSelection({ size: 420, pieceShape: 'square' });
  await waitForText('0 of 420 placed');

  const initial = await playLayout(page);
  const first = initial.tray[0];
  const size = puzzleSizePresets.at(-1).square;
  const target = pieceTarget(initial, first.id, size);
  const midpoint = initial.boardPoint(size.width / 2, size.height / 2);
  const miss = initial.boardPoint(size.width * (target.x < midpoint.x ? 0.75 : 0.25), size.height / 2);
  await dispatch('touchStart', [first.x, first.y]);
  await dispatch('touchMove', [first.x, first.y - 30]);
  await dispatch('touchMove', [miss.x, miss.y]);
  assert.equal(await getAttempt(), undefined, 'Parking does not save until release');
  await dispatch('touchEnd');
  const parked = (await playLayout(page)).parked;
  assert.deepEqual(parked.map(({ id }) => id), [first.id]);
  const saved = await getAttempt();
  assert.deepEqual(saved.placedPieceIds, []);
  assert.deepEqual(saved.trayOrientations, {});

  await page.setViewportSize(landscape);
  await page.reload();
  await waitForText('0 of 420 placed');
  await page.touchscreen.tap(522, 180);
  await waitForText('Resume');
  await page.evaluate(() => { window.paintedText = []; });
  await clickDialog(100, resumeActionY);
  await waitForText('0 of 420 placed');
  const header = await page.evaluate(() => window.paintedText);
  assert.ok(!header.includes('· None'), 'The resumed play header should hide the None challenge label');
  const resumed = await playLayout(page);
  assert.deepEqual(resumed.parked, parked);
  assert.deepEqual(resumed.tray.map(({ id }) => id), initial.tray.slice(1).map(({ id }) => id));
  assert.equal((await readSave(page)).settings.allowLoosePiecesOnBoard, true);

  await setAllowLoosePiecesOnBoard(false);
  const center = resumed.boardPoint(parked[0].x, parked[0].y);
  const slot = resumed.tray[0];
  await moveFinger(center.x, center.y, slot.x, slot.y);
  assert.deepEqual((await playLayout(page)).parked, []);
  assert.equal((await playLayout(page)).tray[0].id, first.id, 'Returning the piece restores its seeded slot');
  assert.equal(await getAttempt(), undefined, 'Returning the last piece clears an otherwise untouched attempt');

  await page.evaluate((attempt) => {
    const key = 'live-jigsaw.save';
    const save = JSON.parse(localStorage.getItem(key));
    save.progress.Windmill = { ...attempt, placedPieceIds: [attempt.parkedGroups[0].anchorPieceId] };
    save.history.Lighthouse = [{ setup: attempt.setup, completedAt: '2025-01-01T12:00:00.000Z' }];
    localStorage.setItem(key, JSON.stringify(save));
  }, saved);
  await page.reload();
  await waitForText('Completed');
  await page.touchscreen.tap(522, 180);
  await waitForText('Piece count');
  assert.ok(!(await page.evaluate(() => window.paintedText)).includes('Resume'), 'An invalid workspace must not restore even its placements');
  assert.deepEqual(errors, []);
});

scenario('the 420-piece Square tray renders cutouts without opposite-edge bleed', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  }, `${compactPuzzlePath}?currentSizes`);
  const setup = {
    size: puzzleSizePresets.at(-1).square,
    seed: 233, connectorStyle: 'classic', animationSpeed: 'Fast', challengeMode: 'none', pieceRotation: false,
  };
  // This piece has an inward top connector and a flat bottom edge.
  const pieceId = 'piece-14-1';
  const placedPieceIds = createPuzzle(setup.size, setup.connectorStyle, setup.seed).pieces
    .map(({ id }) => id).filter((id) => id !== pieceId);
  await page.evaluate((save) => localStorage.setItem('live-jigsaw.save', JSON.stringify(save)), {
    version: saveVersion, progress: { Windmill: { setup, placedPieceIds, trayOrientations: {}, parkedGroups: [] } },
  });
  await page.reload();
  await waitForText('Windmill');
  await page.mouse.click(340, 180);
  await waitForText('Resume');
  await clickDialog(100, resumeActionY);
  await waitForText('419 of 420 placed');

  const { tray } = await playLayout(page);
  const piece = tray.find(({ id }) => id === pieceId);
  const y = Math.round(piece.y - piece.height / 2);
  const screenshot = await canvas.screenshot();
  const background = await pixelAt(page, screenshot, piece.x, y + 4);
  for (const offset of [-24, 24]) {
    assert.notDeepEqual(await pixelAt(page, screenshot, piece.x + offset, y), background, 'The first row should show both shoulders');
  }
  assert.deepEqual(await pixelAt(page, screenshot, piece.x, y), background, 'The top cutout must stay transparent on its outermost row');
  assert.deepEqual(errors, []);
});

scenario('a rectangular 300-piece puzzle opens by touch in portrait and remembers its shape', async (t) => {
  const { page, waitForText, errors, playSelection } = await openPuzzle(t, {
    viewport: { width: 680, height: 800 }, hasTouch: true,
  });
  await page.touchscreen.tap(350, 180);
  await playSelection({ size: 300, pieceShape: 'horizontal-long' });
  await waitForText('0 of 300 placed');
  const recentOptions = (await readSave(page)).recentOptions;
  assert.equal(recentOptions.pieceCount, 300);
  assert.equal(recentOptions.pieceShape, 'horizontal-long');
  await page.reload();
  await waitForText('Windmill');
  await page.touchscreen.tap(350, 180);
  await playSelection();
  await waitForText('0 of 300 placed');
  assert.deepEqual((await readSave(page)).recentOptions, recentOptions);
  assert.deepEqual(errors, []);
});

scenario('right-click picks up pieces that either mouse button can drop without opening the browser menu', async (t) => {
  const { page, canvas, waitForText, errors, playSelection } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  await page.mouse.click(340, 180);
  await playSelection();
  await waitForText('0 of 8 placed');
  await page.evaluate(() => {
    window.canvasContextMenus = [];
    document.addEventListener('contextmenu', (event) => {
      if (event.target instanceof HTMLCanvasElement) window.canvasContextMenus.push(event.defaultPrevented);
    });
  });

  await dragDivider(page, async (x, y, endX, endY) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 8 });
    await page.mouse.up();
  }, { x: 552 });
  const layout = await playLayout(page);
  const { x, y } = layout.tray.find(({ id }) => id === 'piece-0-0');
  const target = cellCenter(layout, 0, 0);

  const rightClick = (x, y) => page.mouse.click(x, y, { button: 'right' });
  const sample = async (x, y) => pixelAt(page, await canvas.screenshot(), x, y);
  const sky = [192, 221, 219, 255];
  assert.deepEqual(await sample(x, y), sky);
  await rightClick(x, y);
  assert.deepEqual(await page.evaluate(() => window.canvasContextMenus), [true]);
  await page.mouse.move(target.x, target.y);
  assert.deepEqual(await sample(target.x, target.y), sky, 'The piece should follow the mouse after right-button release');
  assert.notDeepEqual(await sample(x, y), sky, 'The piece should leave its tray slot');
  assert.equal((await readSave(page)).progress.Windmill, undefined, 'Hovering over the target should not place the piece');

  await rightClick(600, 70);
  assert.deepEqual(await sample(x, y), sky, 'An off-board right-click drop should return the piece');
  assert.equal((await readSave(page)).progress.Windmill, undefined);

  await rightClick(x, y);
  await page.mouse.move(target.x, target.y);
  await page.mouse.wheel(0, -200);
  await page.mouse.click(target.x, target.y);
  await waitForText('1 of 8 placed');
  assert.deepEqual(await sample(target.x, target.y), sky, 'A left-click drop should snap the piece on the zoomed board');
  assert.deepEqual((await readSave(page)).progress.Windmill.placedPieceIds, ['piece-0-0']);
  assert.deepEqual(errors, []);
});

scenario('live pieces scroll, reflow, and snap to the pannable board', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openCompactPuzzle(t, { viewport: { width: 1320, height: 780 } });
  const bounds = await canvas.boundingBox();
  assert.equal(bounds.width, 1320);
  assert.equal(bounds.height, 780);
  const move = (x, y, steps) => page.mouse.move(bounds.x + x, bounds.y + y, { steps });
  const click = (x, y) => page.mouse.click(bounds.x + x, bounds.y + y);
  const clickSettings = paceRepeatClicks(() => pressHeader(page, 'Settings'));
  const drag = async (x, y, endX, endY) => {
    await move(x, y);
    await page.mouse.down();
    await move(endX, endY, 8);
    await page.mouse.up();
  };

  await page.evaluate(() => { window.paintedText = []; });
  await click(340, 180);
  await playSelection();
  await waitForText('0 of 8 placed');
  const header = await page.evaluate(() => window.paintedText);
  await uiControl(page, { sceneKey: 'PlayPuzzle', name: 'All puzzles' });
  assert.ok(header.includes('Windmill'));
  assert.ok(!header.includes('· None'), 'No challenge label is shown for None');
  assert.ok(!header.includes('Pieces') && !header.includes('Drag to pan · Scroll to zoom'));
  const initial = await canvas.screenshot();
  const sky = [192, 221, 219, 255];
  const panelBackground = [32, 46, 42, 255];
  assert.deepEqual(await pixelAt(page, initial, 1267, 113), panelBackground, 'Fit board should start hidden');
  assert.deepEqual(await pixelAt(page, initial, 1290, 100), panelBackground, 'The board should extend into the reclaimed space');
  const initialLayout = await playLayout(page);
  const guidePoint = cellCenter(initialLayout, 0, 0);
  const guide = await pixelAt(page, initial, guidePoint.x, guidePoint.y);
  assert.ok(guide[0] > 25 && guide[0] < sky[0], 'The board should show the artwork at low opacity');
  assert.notDeepEqual(await pixelAt(page, initial, 199, 140), sky, 'The tray should start with one column');
  await move(85, 140);
  await page.mouse.wheel(0, 150);
  const scrolled = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, scrolled, 85, 140), await pixelAt(page, initial, 85, 140));
  await page.mouse.wheel(0, -1000);
  const dividerBackground = [38, 58, 54, 255];
  const dividerX = Math.floor(initialLayout.divider.x);
  assert.deepEqual(await pixelAt(page, initial, dividerX - 3, 320), dividerBackground);
  assert.deepEqual(await pixelAt(page, initial, dividerX + 3, 320), dividerBackground);
  const centerPixels = await Promise.all([dividerX - 1, dividerX, dividerX + 1].map((x) => pixelAt(page, initial, x, 320)));
  assert.equal(centerPixels.filter(([red]) => red > dividerBackground[0]).length, 1, 'The divider should draw a single centered line');
  const gripColor = await pixelAt(page, initial, dividerX, 420);
  assert.notDeepEqual(gripColor, await pixelAt(page, initial, dividerX, 320), 'The divider should have a visible center grip');
  await dragDivider(page, drag, { x: 552 });
  const wideLayout = await playLayout(page);
  const first = wideLayout.tray.find(({ id }) => id === 'piece-0-0');
  const widened = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, widened, 552, 420), gripColor, 'The grip should move with the divider');
  assert.ok(first.x > wideLayout.tray[0].x, 'Widening the tray should reveal another column');
  assert.deepEqual(await pixelAt(page, widened, first.x, first.y), sky);
  const { x: dropX, y: dropY } = cellCenter(wideLayout, 0, 0);
  const { x: secondX, y: secondY } = cellCenter(wideLayout, 1, 0);
  const boardSeam = await pixelAt(page, widened, secondX - 65, secondY - 46);
  assert.deepEqual(boardSeam, guide, 'The faint guide should be continuous across piece boundaries');
  await drag(first.x, first.y, 600, 70);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), first.x, first.y), sky, 'An invalid drop should return to the tray');
  await move(first.x, first.y);
  await page.mouse.down();
  await move(dropX, dropY, 8);
  const beforeZoom = await canvas.screenshot();
  await page.mouse.wheel(0, -200);
  const zoomed = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, beforeZoom, dropX - 85, dropY + 124), panelBackground);
  assert.notDeepEqual(await pixelAt(page, zoomed, dropX - 85, dropY + 124), panelBackground, 'The wheel should enlarge the board');
  assert.notDeepEqual(await pixelAt(page, beforeZoom, dropX + 88, dropY - 10), sky);
  assert.deepEqual(await pixelAt(page, zoomed, dropX + 88, dropY - 10), sky, 'A piece in hand should scale with the board');
  await page.mouse.up();
  await waitForText('1 of 8 placed');
  const placed = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, placed, dropX, dropY), sky, 'Zooming at the drop target should keep it under the pointer');
  await clickSettings();
  await waitForText('Color theme');
  await pressSetting(page, 'Slate');
  await pressSetting(page, 'Done');
  const slate = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, slate, 1317, 100), [33, 44, 59, 255], 'Settings should restyle the active board');
  assert.deepEqual(await pixelAt(page, slate, dropX, dropY), sky, 'The placed piece should stay at its zoomed position');
  await page.evaluate(() => { window.paintedText = []; });
  await clickSettings();
  await waitForText('Color theme');
  await pressSetting(page, 'Dark');
  await pressSetting(page, 'Done');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 1317, 100), [27, 28, 30, 255], 'Dark should use its own board colour');
  await page.evaluate(() => { window.paintedText = []; });
  await clickSettings();
  await waitForText('Color theme');
  await pressSetting(page, 'Forest');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('live-jigsaw.save')).settings.theme === 'Forest');
  await page.keyboard.press('Escape');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const unfiltered = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, unfiltered, 1317, 100), panelBackground);
  const trayPieceColor = await pixelAt(page, unfiltered, 85, 140);
  assert.notDeepEqual(trayPieceColor, [52, 66, 62, 255], 'The sample should be on a tray piece');
  const guidePixel = (screenshot) => pixelAt(page, screenshot, dropX + 255, dropY);
  const originalGuide = await guidePixel(unfiltered);
  const assertGuideColor = (actual, expected, message) => {
    assert.ok(actual.every((channel, i) => Math.abs(channel - expected[i]) <= 1),
      `${message}. Expected ${expected}, got ${actual}`);
  };
  assertGuideColor(originalGuide, [67, 85, 81, 255], 'The original guide should blend with the board at 22% opacity');

  const selectFilter = async (label, name) => {
    await page.evaluate(() => { window.paintedText = []; });
    await clickSettings();
    await waitForText('Black and White');
    const before = await guidePixel(await canvas.screenshot());
    await pressSetting(page, label);
    await page.waitForFunction((expected) => {
      return (JSON.parse(localStorage.getItem('live-jigsaw.save')).settings.filter ?? null) === expected;
    }, name);
    assert.notDeepEqual(await guidePixel(await canvas.screenshot()), before, 'The guide should change while Settings is still open');
    await pressSetting(page, 'Done');
    const screenshot = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, screenshot, 1317, 100), panelBackground, 'The area outside the guide should keep the theme color');
    assert.deepEqual(await pixelAt(page, screenshot, dropX, dropY), sky, 'The placed piece should keep its original color');
    assert.deepEqual(await pixelAt(page, screenshot, 85, 140), trayPieceColor, 'The tray piece should keep its original color');
    return guidePixel(screenshot);
  };
  assertGuideColor(await selectFilter('Black and White', 'grayscale'), [107, 116, 113, 255], 'Black and White should blend with the board at 42% opacity');
  assertGuideColor(await selectFilter('Sepia', 'sepia'), [88, 92, 76, 255], 'Sepia should blend with the board at 22% opacity');
  assertGuideColor(await selectFilter('Faded', 'faded'), [94, 108, 105, 255], 'Faded should blend with the board at 42% opacity');

  await move(dropX, dropY);
  await page.mouse.wheel(0, 200);
  const second = (await playLayout(page)).tray.find(({ id }) => id === 'piece-0-1');
  await move(second.x, second.y);
  await page.mouse.down();
  await move(secondX, secondY, 8);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), secondX, secondY), sky, 'The dragged piece should keep its original color');
  await page.mouse.up();
  const highlighted = await canvas.screenshot();
  await waitForText('2 of 8 placed');
  const seamPoints = [[63, -11], [67, -9], [76, -6], [80, 0], [74, 9]];
  const seamColors = (screenshot) => {
    const { width, data } = PNG.sync.read(screenshot);
    return seamPoints.map(([dx, dy]) => {
      const offset = (Math.round(dropY + dy) * width + Math.round(dropX + dx)) * 4;
      return [...data.subarray(offset, offset + 4)];
    });
  };
  assert.ok(seamColors(highlighted).some(([red, , blue]) => red - blue > 25),
    'The newly joined seam should briefly flash warm gold against the cool artwork');
  let joined = highlighted;
  const fadeDeadline = Date.now() + 2000;
  const isSky = (color) => color.every((channel, index) => channel === sky[index]);
  while (!seamColors(joined).every(isSky) && Date.now() < fadeDeadline) {
    joined = await canvas.screenshot();
  }
  assert.deepEqual(await pixelAt(page, joined, secondX, secondY), sky, 'A newly placed piece should keep its original color');
  for (const color of seamColors(joined)) {
    assert.deepEqual(color, sky, 'The live guide should not show through joined pieces');
  }
  assert.deepEqual(await selectFilter('Clear filter', null), originalGuide, 'Clearing the filter should restore the original guide');

  await page.setViewportSize({ width: 1500, height: 850 });
  await page.waitForFunction(() => document.querySelector('canvas').height === 850);
  const resized = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, resized, 1450, 800), panelBackground, 'The board panel should fill the resized window');
  await page.setViewportSize({ width: 1320, height: 780 });
  await page.waitForFunction(() => document.querySelector('canvas').height === 780);
  await page.evaluate(() => { window.paintedText = []; });
  await pressHeader(page, 'All puzzles');
  await waitForPicker(page);
  await click(1160, 180);
  await seedNextAttempt(page, 49);
  await playSelection({ size: 32 });
  await waitForText('0 of 32 placed');
  await dragDivider(page, drag, { x: 552 });
  const beforePan = await canvas.screenshot();
  await drag(900, 350, 800, 270);
  const afterPan = await canvas.screenshot();
  const tower = await pixelAt(page, beforePan, 1124, 492);
  assert.notDeepEqual(await pixelAt(page, afterPan, 1124, 492), tower);
  assert.deepEqual(await pixelAt(page, afterPan, 1024, 412), tower, 'The 32-piece artwork should move with both pan axes');
  const pannedLayout = await playLayout(page);
  const piece = pannedLayout.tray[0];
  const drop = pieceTarget(pannedLayout, piece.id, { width: 1024, height: 576, columns: 8, rows: 4 });
  await drag(piece.x, piece.y, drop.x, drop.y);
  await waitForText('1 of 32 placed');
  assert.deepEqual((await readSave(page)).progress.Lighthouse.placedPieceIds, [piece.id]);
  const fit = (await playLayout(page)).fitButton;
  assert.equal(fit.visible, true, 'Panning should show Fit board');
  await click(fit.x + fit.width / 2, fit.y + fit.height / 2);
  const fitted = await canvas.screenshot();
  const fittedLayout = await playLayout(page);
  assert.equal(fittedLayout.fitButton.visible, false);
  assert.equal(fittedLayout.nativeSizeButton.visible, true, 'Only the 1× button should remain after fitting');
  assert.deepEqual(await pixelAt(page, fitted, 900, 205), panelBackground, 'The large board should fit vertically when scaled to the narrowed panel');
  assert.notDeepEqual(await pixelAt(page, fitted, 900, 240), panelBackground, 'The fitted board should be centered');

  await page.setViewportSize({ width: 900, height: 620 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 900);
  await page.evaluate(() => { window.paintedText = []; });
  await pressHeader(page, 'All puzzles');
  await waitForPicker(page);
  await click(460, 180);
  await waitForText('Resume');
  await clickDialog(-6, resumeActionY);
  await seedNextAttempt(page, 1);
  await playSelection({ size: 8 });
  await waitForText('0 of 8 placed');
  const replay = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, replay, 85, 140), sky);
  assert.notDeepEqual(await pixelAt(page, initial, 85, 140), sky, 'Resetting with a fresh seed should change the tray order');
  await page.evaluate(() => { window.paintedText = []; });
  await pressHeader(page, 'All puzzles');
  await waitForPicker(page);
  await click(340, 180);
  await playSelection({ size: 64 });
  await waitForText('0 of 64 placed');
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 85, 140), [52, 66, 62, 255], 'The 64-piece tray should render its thumbnails');
  assert.deepEqual(errors, []);
});

scenario('the landscape scenes animate on the board', async (t) => {
  const { page, waitForText, errors, playSelection } = await openPuzzle(t, { viewport: { width: 1320, height: 780 } });
  const selections = [
    ['Mountains', 'Meadow'],
    ['Desert', 'Forest'],
    ['Canyon Drift', 'Twilight Ridge'],
    ['Pine Highlands', 'Ember Mesa'],
    ['Afterglow', 'Silver Cloudbank'],
    ['Moonlit Skies', 'Sea of Clouds'],
    ['Birch Glade', 'Fallen Timber'],
    ['Fernwood Grove', 'Amber Woods'],
  ];
  const board = { x: 207, y: 135, width: 1060, height: 570 };
  const emptyGuide = [32, 46, 42, 255];

  for (const [index, title] of selections.flat().entries()) {
    const rows = [1, 2, 4, 5, 6, 7, 8, 9];
    const scroll = Math.round((rows[Math.floor(index / 2)] * 403 - 300) / 0.75);
    await scrollPickerTo(page, scroll);
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(index % 2 ? 935 : 340, 570);
    await playSelection({ connectorStyle: 'Angular', animationSpeed: 'Fast' });
    await waitForText(title);
    await waitForText('0 of 40 placed');
    let firstArtwork;
    let animated = false;
    for (const deadline = Date.now() + 4000; Date.now() < deadline;) {
      const frame = await page.screenshot({ clip: board });
      if (!firstArtwork) {
        const sample = await pixelAt(page, frame, board.width / 2, board.height / 2);
        if (sample.some((channel, index) => channel !== emptyGuide[index])) firstArtwork = frame;
      } else if (!firstArtwork.equals(frame)) {
        animated = true;
        break;
      }
    }
    assert.ok(firstArtwork, `${title} should fill the board guide`);
    assert.ok(animated, `${title} should animate the captured artwork`);
    await page.evaluate(() => { window.paintedText = []; });
    await pressHeader(page, 'All puzzles');
    await waitForPicker(page);
  }
  assert.deepEqual(errors, []);
});

scenario('source artwork fills the capture without stretching or enlarging raster layers', async (t) => {
  const { page, waitForText, errors, clickDialog } = await openCompactPuzzle(t, { viewport: { width: 1320, height: 780 } });
  const setups = {
    Windmill: { width: 1456, height: 416, columns: 8, rows: 4 },
    Lighthouse: { width: 832, height: 728, columns: 8, rows: 4 },
    CanyonDrift: { width: 1080, height: 624, columns: 12, rows: 6 },
  };
  await page.evaluate((setups) => {
    const progress = Object.fromEntries(Object.entries(setups).map(([key, size]) => [key, {
      setup: {
        size: { ...size, snapTolerance: 16 }, seed: 233, connectorStyle: 'classic',
        animationSpeed: 'Normal', challengeMode: 'none', pieceRotation: false,
      },
      placedPieceIds: ['piece-0-0'], trayOrientations: {},
    }]));
    localStorage.setItem('live-jigsaw.save', JSON.stringify({ version: 6, progress }));
  }, setups);
  await page.reload();
  await waitForText('Windmill');

  const resume = async (key, x, y) => {
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(x, y);
    await waitForText('Resume');
    await clickDialog(100, resumeActionY);
    await page.waitForFunction((key) => window.puzzleArtworkScene?.sys.settings.key === key, key);
  };
  const backToPicker = async () => {
    await page.evaluate(() => { window.paintedText = []; });
    await pressHeader(page, 'All puzzles');
    await waitForPicker(page);
  };

  for (const [key, x] of [['Windmill', 340], ['Lighthouse', 935]]) {
    await resume(key, x, 180);
    const transform = await page.evaluate(() => {
      const [artwork] = window.puzzleArtworkScene.children.list;
      return [artwork.x, artwork.y, artwork.scaleX, artwork.scaleY];
    });
    const { width, height } = setups[key];
    const scale = Math.max(width / 512, height / 288);
    assert.deepEqual(transform, [(width - 512 * scale) / 2, (height - 288 * scale) / 2, scale, scale], key);
    await backToPicker();
  }

  const groundTravel = 0.036;
  const scaleForGroundSweep = (width) => width * (1 + 2 * groundTravel) / 1920;
  const canyonSizes = [
    { ...setups.CanyonDrift, scale: scaleForGroundSweep(1080) },
    { width: 1248, height: 540, scale: scaleForGroundSweep(1248) },
    { width: 1920, height: 1080, scale: 1 },
  ];
  for (const [index, { width, height, scale }] of canyonSizes.entries()) {
    if (index > 0) {
      const save = await readSave(page);
      Object.assign(save.progress.CanyonDrift.setup.size, { width, height });
      await page.evaluate((save) => localStorage.setItem('live-jigsaw.save', JSON.stringify(save)), save);
      await page.reload();
      await waitForText('Windmill');
    }
    await scrollPickerTo(page, 1700);
    await resume('CanyonDrift', 340, 600);
    const { scales, skySize, groundEdges, travel } = await page.evaluate(() => {
      const scene = window.puzzleArtworkScene;
      const layers = scene.children.list;
      const layer = (name) => layers.find((image) => image.texture.key.endsWith(`-${name}`));
      const sky = layer('sky');
      const ground = layer('ground');
      const mesas = layer('distant-mesas');
      const cactus = layer('cactus');
      const [pan] = scene.tweens.getTweens();
      pan.seek(100, 16.6, true);
      const startPan = Math.sin(pan.targets[0].angle);
      const movingLayers = [ground, mesas, cactus];
      const startX = movingLayers.map((image) => image.x);
      pan.seek(3499, 16.6, true);
      const panChange = Math.sin(pan.targets[0].angle) - startPan;
      return {
        scales: layers.map(({ scaleX, scaleY }) => [scaleX, scaleY]),
        skySize: [sky.displayWidth, sky.displayHeight],
        groundEdges: [ground.x - ground.displayWidth / 2, ground.x + ground.displayWidth / 2],
        travel: movingLayers.map((image, index) => (startX[index] - image.x) / panChange),
      };
    });
    const epsilon = 1e-6;
    for (const [x, y] of scales) {
      assert.equal(x, y, 'Parallax layers should not stretch');
      assert.ok(Math.abs(x - scale) < epsilon, 'Scale should retain room for the full sweep without upscaling');
    }
    assert.ok(skySize[0] >= width - epsilon && skySize[1] >= height - epsilon, 'Sky should fill the board');
    const [left, right] = groundEdges;
    assert.ok(left <= epsilon && right >= width - epsilon, 'Ground should not expose a hard edge at full drift');
    const expectedTravel = width === 1920 ? [0, 0, 0.05] : [groundTravel, 0.012, 0.05];
    for (const [index, fraction] of expectedTravel.entries()) {
      assert.ok(Math.abs(travel[index] - width * fraction) < epsilon,
        `Layer ${index} should travel ${fraction} of the board width, traveled ${travel[index] / width}`);
    }
    await backToPicker();
  }
  assert.deepEqual(errors, []);
});

scenario('parallax seeds place both foreground and background artwork', async (t) => {
  const { page, waitForText, errors, playSelection } = await openCompactPuzzle(t, { viewport: { width: 1320, height: 780 } });

  const artworkPosition = async ({ name, cardX, scroll, rowY, matches }, seed) => {
    await scrollPickerTo(page, scroll);
    await page.mouse.click(cardX, 600);
    await waitForText('Animation speed');
    await page.evaluate((seed) => {
      const getRandomValues = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (values) => {
        if (!(values instanceof Uint32Array) || values.length !== 1) return getRandomValues(values);
        crypto.getRandomValues = getRandomValues;
        values[0] = seed;
        return values;
      };
    }, seed);
    await playSelection({ animationSpeed: 'Slow' });
    await waitForText('0 of 8 placed');
    await page.evaluate(async () => {
      for (let frame = 0; frame < 12; frame += 1) await new Promise(requestAnimationFrame);
    });

    const { x, y } = (await playLayout(page)).boardPoint(0, rowY);
    const row = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 512, height: 1 } });
    const { width, data } = PNG.sync.read(row);
    const artworkPixels = [];
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = data.subarray(x * 4, x * 4 + 3);
      if (matches(red, green, blue)) artworkPixels.push(x);
    }
    assert.ok(artworkPixels.length > 0, `The ${name} should be visible for seed ${seed}`);
    const position = (artworkPixels[0] + artworkPixels.at(-1)) / 2 / width;

    await page.evaluate(() => { window.paintedText = []; });
    await pressHeader(page, 'All puzzles');
    await waitForPicker(page);
    return position;
  };

  const seededArtwork = [
    {
      name: 'cactus', cardX: 340, scroll: 1700, rowY: 276,
      matches: (red, green, blue) => green > red + 10 && green > blue + 5,
    },
    {
      name: 'sun', cardX: 935, scroll: 2300, rowY: 76,
      matches: (red, green) => red >= 75 && green >= 75,
    },
  ];
  for (const artwork of seededArtwork) {
    const left = await artworkPosition(artwork, 0);
    const right = await artworkPosition(artwork, 2);
    const repeated = await artworkPosition(artwork, 0);
    assert.ok(left < 0.35 && right > 0.65, `Different seeds should move the ${artwork.name} to opposite sides`);
    assert.ok(Math.abs(left - repeated) < 0.05, `The same seed should restore the ${artwork.name}'s position within its pan range`);
  }
  assert.deepEqual(errors, []);
});

function waitForPuzzleLoading(page, message = 'Loading puzzle…') {
  return page.waitForFunction((message) => {
    const play = window.puzzlePickerScene?.sys.game.scene.getScene('PlayPuzzle');
    const spinner = play?.children.getByName('Puzzle loading spinner');
    return play?.children.getByName('Puzzle load status')?.text === message
      && spinner?.visible === (message === 'Loading puzzle…');
  }, message, { timeout: 5000 });
}

function waitForPuzzleArtwork(page) {
  return page.waitForFunction(() => {
    const play = window.puzzlePickerScene?.sys.game.scene.getScene('PlayPuzzle');
    return play?.sys.isActive() && !play.children.getByName('Puzzle load status')
      && !play.children.getByName('Puzzle loading spinner');
  });
}

scenario('the full-HD medieval village shows shared loading and animates after reopening', async (t) => {
  const { page, waitForText, errors, clickDialog } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  await saveFullHDPuzzle(page, 'MedievalVillage', 233);
  await waitForText('Windmill');
  const atlas = /medievalRTS_spritesheet[^/]*\.png(?:\?|$)/;
  const loading = Promise.withResolvers();
  const release = Promise.withResolvers();
  t.after(() => release.resolve());

  const openVillage = async () => {
    await page.evaluate(() => { window.paintedText = []; });
    await scrollPickerTo(page, 1210);
    await page.mouse.click(340, 600);
    await waitForText('Resume');
    await clickDialog(100, resumeActionY);
    await waitForText('Medieval Village');
    await waitForText('1 of 32 placed');
  };

  const failAtlas = (route) => route.fulfill({ status: 503 });
  await page.route(atlas, failAtlas);
  await openVillage();
  await waitForPuzzleLoading(page, 'Could not load the puzzle.');
  await pressHeader(page, 'All puzzles');
  await waitForPicker(page);
  await page.unroute(atlas, failAtlas);

  await page.route(atlas, async (route) => {
    loading.resolve();
    await release.promise;
    await route.abort();
  });
  await openVillage();
  await loading.promise;
  await waitForPuzzleLoading(page);

  await pressHeader(page, 'All puzzles');
  await waitForPicker(page);
  // Returning to the picker can cancel the browser request before the held route resumes.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  release.resolve();

  await openVillage();
  await waitForPuzzleArtwork(page);
  const board = { x: 197, y: 90, width: 1060, height: 660 };
  const before = await page.screenshot({ clip: board });
  await page.evaluate(async () => {
    for (let frame = 0; frame < 12; frame += 1) await new Promise(requestAnimationFrame);
  });
  const after = await page.screenshot({ clip: board });
  assert.ok(!before.equals(after), 'The captured village should animate');
  assert.deepEqual(errors, []);
});

scenario('Hex Coast captures continuous roads and animated water', async (t) => {
  const { page, waitForText, errors, clickDialog } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  await saveFullHDPuzzle(page, 'HexCoast', 42);
  await waitForText('Windmill');
  const atlasLoaded = (name) => page.waitForResponse((response) =>
    new RegExp(`/${name}-[^/]+\\.png$`).test(response.url()) && response.ok());
  const atlases = Promise.all([atlasLoaded('fullTiles'), atlasLoaded('buildings')]);
  await scrollPickerTo(page, 1210);
  await page.mouse.click(935, 600);
  await waitForText('Resume');
  await clickDialog(100, resumeActionY);
  const [[terrain]] = await Promise.all([atlases, waitForText('1 of 32 placed')]);
  const atlas = readFileSync(new URL('../src/puzzles/hexCoast/assets/fullTiles.xml', import.meta.url), 'utf8');
  const unpadded = await page.evaluate(async ({ url, atlas }) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const rgba = new Uint32Array(pixels.buffer);
    const at = (x, y) => x >= 0 && x < canvas.width && y >= 0 && y < canvas.height
      ? rgba[y * canvas.width + x] : undefined;
    const frames = new DOMParser().parseFromString(atlas, 'text/xml').querySelectorAll('SubTexture');
    return Array.from(frames).filter((frame) => {
      const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((key) => Number(frame.getAttribute(key)));
      const right = x + width - 1;
      const bottom = y + height - 1;
      for (let row = y; row <= bottom; row += 1) {
        if (at(x - 1, row) !== at(x, row) || at(right + 1, row) !== at(right, row)) return true;
      }
      for (let column = x; column <= right; column += 1) {
        if (at(column, y - 1) !== at(column, y) || at(column, bottom + 1) !== at(column, bottom)) return true;
      }
      return false;
    }).map((frame) => frame.getAttribute('name'));
  }, { url: terrain.url(), atlas });
  assert.deepEqual(unpadded, [], 'Terrain frames should repeat their edge pixels for linear filtering');

  const board = { x: 197, y: 90, width: 1060, height: 660 };
  await page.waitForFunction(() => window.paintedText.filter((text) => text === 'Hex Coast').length >= 2);
  await page.waitForTimeout(200);
  const before = await page.screenshot({ clip: board });
  const { width, data } = PNG.sync.read(before);
  let longestRoad = 0;
  for (let y = 0; y < board.height; y += 1) {
    let run = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = (y * width + x) * 4;
      const red = data[pixel], green = data[pixel + 1], blue = data[pixel + 2];
      const road = Math.abs(red - 74) <= 2 && Math.abs(green - 77) <= 2 && Math.abs(blue - 59) <= 2;
      run = road ? run + 1 : 0;
      longestRoad = Math.max(longestRoad, run);
    }
  }
  assert.ok(longestRoad >= 64, `A horizontal road should cover a full native hex, got ${longestRoad}px`);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 12; frame += 1) await new Promise(requestAnimationFrame);
  });
  const after = await page.screenshot({ clip: board });
  assert.ok(!before.equals(after), 'Water movement should change the captured puzzle');
  assert.deepEqual(errors, []);
});

scenario('picker Settings remembers the theme and filter on a narrow touch screen', async (t) => {
  const { page, canvas, waitForText, errors, clickSetting } = await openPuzzle(t, {
    viewport: { width: 375, height: 640 }, hasTouch: true, isMobile: true,
  });
  await waitForPicker(page);
  const previewY = await page.evaluate(() => {
    const panel = window.puzzlePickerScene.children.list.find(({ type }) => type === 'rexScrollablePanel');
    const [firstCard] = panel.getElement('panel.cards.items');
    return Math.round(firstCard.y + 65);
  });
  const forest = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, forest, 5, 105), [38, 58, 54, 255]);
  await pressHeader(page, 'Settings', true);
  await waitForText('Color theme');
  await clickSetting('Slate');
  await clickSetting('Faded');
  await clickSetting('Done');
  const slate = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, slate, 5, 105), [39, 51, 68, 255]);
  assert.deepEqual(await pixelAt(page, slate, 5, 130), [39, 51, 68, 255], 'The Phaser canvas background should change too');
  assert.deepEqual(await pixelAt(page, slate, 75, previewY), await pixelAt(page, forest, 75, previewY), 'Preview artwork should keep its colors');
  await page.reload();
  await waitForPicker(page);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 5, 105), [39, 51, 68, 255]);
  await pressHeader(page, 'Settings', true);
  await waitForText('Faded');
  const faded = await uiControl(page, { sceneKey: 'Settings', text: 'Faded' });
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), faded.x - faded.width / 4, faded.y + faded.height / 4),
    [76, 102, 135, 255], 'The saved filter should use the Slate selected tile fill after reload');
  await clickSetting('Dark');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('live-jigsaw.save')).settings.theme === 'Dark');
  await clickSetting('Done');
  const dark = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, dark, 5, 105), [33, 33, 33, 255]);
  assert.deepEqual(await pixelAt(page, dark, 75, previewY), await pixelAt(page, forest, 75, previewY), 'Dark should preserve preview artwork');
  await page.reload();
  await waitForPicker(page);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 5, 105), [33, 33, 33, 255]);
  await pressHeader(page, 'Settings', true);
  await waitForText('Rose');
  await clickSetting('Rose');
  assert.equal((await readSave(page)).settings.theme, 'Rose');
  await clickSetting('Done');
  const rose = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, rose, 5, 105), [250, 233, 238, 255]);
  assert.deepEqual(await pixelAt(page, rose, 75, previewY), await pixelAt(page, forest, 75, previewY), 'Rose should preserve preview artwork');
  await page.reload();
  await waitForPicker(page);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 5, 105), [250, 233, 238, 255]);
  await page.evaluate(() => {
    localStorage.removeItem('live-jigsaw.save');
    localStorage.setItem('live-jigsaw.theme', 'Slate');
    localStorage.setItem('live-jigsaw.puzzle-filter', 'sepia');
  });
  await page.reload();
  await waitForPicker(page);
  assert.deepEqual((await readSave(page)).settings, {
    theme: 'Slate', filter: 'sepia', trayFractions: { vertical: 0, horizontal: 0 }, allowLoosePiecesOnBoard: false,
    pickerPreviewSize: 'Full',
  });
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 5, 105), [39, 51, 68, 255]);
  assert.deepEqual(errors, []);
});

scenario('version 1 through 10 saves migrate with settings, options, progress, and history intact', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog } = await openPuzzle(t, { viewport: { width: 1320, height: 780 } });
  const size = { width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 };
  const setup = {
    size: { label: 'Classic', ...size },
    seed: 42, connectorStyle: 'classic', animationSpeed: 'Normal',
  };
  const original = {
    version: 1,
    settings: { theme: 'Slate', filter: 'sepia', trayPosition: 'Right' },
    recentOptions: { sizeLabel: 'Classic', connectorStyle: 'classic', animationSpeed: 'Normal' },
    progress: { Windmill: { setup, placedPieceIds: ['piece-0-0'] } },
    history: { Lighthouse: [{ setup, completedAt: '2025-01-01T12:00:00.000Z' }] },
  };
  const storeSave = (data) => page.evaluate((value) => localStorage.setItem('live-jigsaw.save', JSON.stringify(value)), data);
  const trayFractions = { vertical: 0, horizontal: 0 };
  const settings = { ...original.settings, trayFractions };
  const migratedSettings = { ...settings, allowLoosePiecesOnBoard: false, pickerPreviewSize: 'Full' };
  const sequentialCompletion = {
    setup: { ...setup, challengeMode: 'sequential' }, completedAt: '2025-01-02T12:00:00.000Z',
  };
  const version3 = {
    ...original,
    version: 3,
    settings,
    recentOptions: { ...original.recentOptions, challengeMode: 'standard' },
    progress: { Windmill: { ...original.progress.Windmill, setup: { ...setup, challengeMode: 'standard' } } },
    history: { Lighthouse: [
      { ...original.history.Lighthouse[0], setup: { ...setup, challengeMode: 'standard' } },
      sequentialCompletion,
    ] },
  };
  const version4 = {
    ...version3,
    version: 4,
    recentOptions: { ...version3.recentOptions, sizeLabel: 'Large', challengeMode: 'none' },
    progress: { Windmill: { ...original.progress.Windmill, setup: { ...setup, challengeMode: 'none' } } },
    history: { Lighthouse: [
      { ...original.history.Lighthouse[0], setup: { ...setup, challengeMode: 'none' } },
      sequentialCompletion,
    ] },
  };
  const noneSetupV5 = { ...setup, size, challengeMode: 'none' };
  const sequentialSetupV5 = { ...sequentialCompletion.setup, size };
  const version5 = {
    ...version4,
    version: 5,
    recentOptions: { pieceCount: 32, connectorStyle: 'classic', animationSpeed: 'Normal', challengeMode: 'none' },
    progress: { Windmill: { ...original.progress.Windmill, setup: noneSetupV5 } },
    history: { Lighthouse: [
      { ...original.history.Lighthouse[0], setup: noneSetupV5 },
      { ...sequentialCompletion, setup: sequentialSetupV5 },
    ] },
  };
  const noneSetup = { ...noneSetupV5, pieceRotation: false };
  for (const previous of [original, { ...original, version: 2, settings }, version3, version4, version5]) {
    await storeSave(previous);
    await page.reload();
    await waitForText('Completed');
    await waitForText('1 of 8 placed');
    assert.deepEqual(await readSave(page), {
      version: saveVersion,
      settings: migratedSettings,
      recentOptions: {
        pieceCount: previous.version >= 4 ? 40 : 8, connectorStyle: 'classic', animationSpeed: 'Normal',
        challengeMode: 'none', pieceRotation: false, pieceShape: 'square',
      },
      progress: { Windmill: { ...original.progress.Windmill, setup: noneSetup, trayOrientations: {}, parkedGroups: [] } },
      history: { Lighthouse: [
        { ...original.history.Lighthouse[0], setup: noneSetup },
        ...(previous.version >= 3 ? [{ ...sequentialCompletion, setup: { ...sequentialSetupV5, pieceRotation: false } }] : []),
      ] },
    });
  }
  const hasStatusInk = (screenshot, left, top, right, bottom) => {
    const { width, data } = PNG.sync.read(screenshot);
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * width + x) * 4;
        if (data[offset] >= 235 && data[offset + 1] >= 240 && data[offset + 2] >= 247) return true;
      }
    }
    return false;
  };
  assert.ok(hasStatusInk(await canvas.screenshot(), 478, 431, 633, 448), 'Status should align to the right on a wide card');
  await page.setViewportSize({ width: 320, height: 780 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 320);
  const artworkBottom = await page.evaluate(() => {
    const panel = window.puzzlePickerScene.children.list.find(({ type }) => type === 'rexScrollablePanel');
    const [card] = panel.getElement('panel.cards.items');
    return Math.round(card.getChildren().find(({ type }) => type === 'RenderTexture').getBounds().bottom);
  });
  assert.ok(hasStatusInk(await canvas.screenshot(), 30, artworkBottom + 62, 185, artworkBottom + 84),
    'Status should have its own line on a narrow card');
  await page.setViewportSize({ width: 1320, height: 780 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 1320);
  await canvas.screenshot();
  await page.mouse.click(340, 180);
  await waitForText('Resume');
  await waitForText('Challenge mode: None');

  const legacySize = { width: 1792, height: 1008, columns: 28, rows: 14, snapTolerance: 16 };
  const legacySetup = { ...noneSetup, size: legacySize };
  const version6 = {
    version: 6, settings,
    recentOptions: { ...version5.recentOptions, pieceCount: 392, pieceRotation: false },
    progress: { Windmill: { setup: legacySetup, placedPieceIds: ['piece-0-0'], trayOrientations: {} } },
    history: { Lighthouse: [{ ...original.history.Lighthouse[0], setup: legacySetup }] },
  };
  await storeSave(version6);
  await page.reload();
  await waitForText('Completed');
  await waitForText('1 of 392 placed');
  assert.deepEqual(await readSave(page), {
    ...version6, version: saveVersion, settings: migratedSettings,
    progress: { Windmill: { ...version6.progress.Windmill, parkedGroups: [] } },
    recentOptions: { ...version6.recentOptions, pieceCount: 420, pieceShape: 'square' },
  });
  await clickDialog(-320, -210);
  await waitForText('Resume');
  await page.evaluate(() => { window.paintedText = []; });
  await clickDialog(96, resumeActionY);
  await waitForText('1 of 392 placed');

  const version7 = {
    ...version6, version: 7,
    recentOptions: { ...version6.recentOptions, pieceCount: 288, pieceShape: 'horizontal-long' },
  };
  await storeSave(version7);
  await page.reload();
  await waitForText('Completed');
  await waitForText('1 of 392 placed');
  assert.deepEqual(await readSave(page), {
    ...version7, version: saveVersion, settings: migratedSettings,
    progress: { Windmill: { ...version7.progress.Windmill, parkedGroups: [] } },
    recentOptions: { ...version7.recentOptions, pieceCount: 300 },
  });

  const rotating = createPuzzle(size, 'classic', 42, 'none', true);
  const first = rotating.trayPieces[0];
  while (rotating.orientationOf(first.id) !== 0) rotating.turnPiece(first.id);
  rotating.drop(first.id, first.target);
  rotating.turnPiece(rotating.trayPieces[0].id);
  const version8 = {
    ...version7, version: 8,
    settings: { ...settings, trayFractions: { vertical: 0.36, horizontal: 0.18 } },
    progress: { Windmill: { setup: { ...noneSetup, pieceRotation: true }, ...rotating.snapshot() } },
  };
  await storeSave(version8);
  await page.reload();
  await waitForText('Completed');
  await waitForText('1 of 8 placed');
  assert.deepEqual(await readSave(page), {
    ...version8, version: saveVersion, settings: { ...migratedSettings, trayFractions: version8.settings.trayFractions },
    progress: { Windmill: { ...version8.progress.Windmill, parkedGroups: [] } },
  });

  const version9 = {
    ...version8, version: 9, settings: { ...version8.settings, missedDropMode: 'park-on-board' },
    progress: { Windmill: { ...version8.progress.Windmill, parkedGroups: [] } },
  };
  const version10 = {
    ...version9, version: 10, settings: { ...version8.settings, allowLoosePiecesOnBoard: true },
  };
  for (const previous of [version9, version10]) {
    await storeSave(previous);
    await page.reload();
    await waitForText('Completed');
    await waitForText('1 of 8 placed');
    assert.deepEqual(await readSave(page), {
      ...version10, version: saveVersion, settings: { ...version10.settings, pickerPreviewSize: 'Full' },
    });
  }

  const future = { ...original, version: 99, futureField: { keep: true } };
  await storeSave(future);
  await page.reload();
  await waitForText('Windmill');
  await pressHeader(page, 'Settings');
  await waitForText('Color theme');
  await pressSetting(page, 'Dark');
  await pressSetting(page, 'Done');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 5, 105), [33, 33, 33, 255], 'The new setting should apply in memory');
  assert.deepEqual(await readSave(page), future, 'A settings change should leave a newer save intact');
  assert.deepEqual(errors, []);
});

scenario('piece rotation distinguishes clicks and taps from drag, scroll, and cancellation', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection, setAllowLoosePiecesOnBoard } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const { dispatch, moveFinger } = await touchController(page);
  const getAttempt = async () => (await readSave(page)).progress.Windmill;
  const pickWindmill = () => clickDialog(-320, -210);
  await setAllowLoosePiecesOnBoard(false);
  await pickWindmill();
  await playSelection({ connectorStyle: 'None', pieceRotation: true });
  await waitForText('0 of 8 placed');
  assert.equal((await readSave(page)).recentOptions.pieceRotation, true);

  const puzzle = createPuzzle(compactSize, 'none', 233, 'none', true);
  const { id, target } = puzzle.trayPieces[0];
  const layout = await playLayout(page);
  const { x, y, width, height } = layout.tray[0];
  const { x: targetX, y: targetY } = layout.boardPoint(target.x, target.y);
  const rotatedEdge = x + (width + height) / 4;
  const sample = async (x, y) => pixelAt(page, await canvas.screenshot(), x, y);
  const trayColor = await sample(1, y);
  const firstPieceColor = await sample(x, y);
  assert.notDeepEqual(firstPieceColor, trayColor);
  await dispatch('touchStart', [x, y]);
  await dispatch('touchMove', [x, y + 14]);
  await dispatch('touchMove', [x, y]);
  await dispatch('touchEnd');
  await dispatch('touchStart', [x, y]);
  await dispatch('touchCancel');
  assert.equal(await getAttempt(), undefined, 'Neither a cancelled press nor movement below the scroll threshold is a tap');
  await moveFinger(x, y + 103, x, y);
  assert.notDeepEqual(await sample(x, y), firstPieceColor, 'A swipe starting on a piece should move the tray');
  await moveFinger(x, y, x, y + 103);
  assert.equal(await getAttempt(), undefined, 'Scrolling from a piece should not turn it');

  let turns = (puzzle.orientationOf(id) + 1) % 4;
  await page.mouse.click(x, y);
  const firstSave = await getAttempt();
  assert.deepEqual(firstSave.placedPieceIds, []);
  assert.equal(firstSave.trayOrientations[id], turns);
  while (turns % 2 === 0) {
    await page.touchscreen.tap(x, y);
    turns = (turns + 1) % 4;
    assert.equal((await getAttempt()).trayOrientations[id], turns);
  }
  assert.notDeepEqual(await sample(rotatedEdge, y), trayColor, 'A sideways rectangular piece should render past its upright edge');
  const sideways = await getAttempt();
  await moveFinger(x, y, targetX, targetY, 'touchCancel');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 8 });
  assert.deepEqual(await sample(x, y), trayColor, 'Moving the mouse after pressing should lift the piece');
  await page.mouse.up();
  assert.deepEqual(await getAttempt(), sideways, 'Cancellation and a sideways drop leave the saved turn intact');
  assert.notDeepEqual(await sample(x, y), trayColor, 'The rejected piece is back in its slot');

  await page.reload();
  await waitForText('Windmill');
  await pickWindmill();
  await waitForText('Piece rotation: On');
  await clickDialog(100, resumeActionY);
  await uiControl(page, { sceneKey: 'PlayPuzzle', name: 'All puzzles' });
  assert.notDeepEqual(await sample(rotatedEdge, y), trayColor, 'Reload restores the sideways piece');
  await page.touchscreen.tap(rotatedEdge, y);
  turns = (turns + 1) % 4;
  assert.equal((await getAttempt()).trayOrientations[id], turns, 'A tap on the rotated edge should hit');
  while (turns !== 0) {
    await page.touchscreen.tap(x, y);
    turns = (turns + 1) % 4;
    assert.equal((await getAttempt()).trayOrientations[id], turns);
  }
  await moveFinger(x, y, targetX, targetY);
  await waitForText('1 of 8 placed');
  assert.deepEqual((await getAttempt()).placedPieceIds, [id]);
  assert.equal(Object.hasOwn((await getAttempt()).trayOrientations, id), false);

  await pressHeader(page, 'All puzzles', true);
  await waitForPicker(page);
  await clickDialog(343, -210);
  await playSelection();
  assert.equal((await readSave(page)).recentOptions.pieceRotation, true, 'The next puzzle should default to the persisted choice');
  assert.deepEqual(errors, []);
});

scenario('parking joins right-click drops, restores cancelled touch drags and returns a rotated group to the tray', async (t) => {
  const { page, waitForText, errors, clickDialog, playSelection, setAllowLoosePiecesOnBoard } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const { dispatch, moveFinger } = await touchController(page);
  await page.touchscreen.tap(340, 180);
  await playSelection({ connectorStyle: 'None', pieceRotation: true });
  await waitForText('0 of 8 placed');
  await dragDivider(page, moveFinger, { x: 552 });
  const initial = await playLayout(page);
  const seededOrder = initial.tray.map(({ id }) => id);
  const puzzle = createPuzzle(compactSize, 'none', 233, 'none', true);
  const [left, right] = ['piece-0-0', 'piece-0-1'];
  const clickAt = ({ x, y }, button) => page.mouse.click(x, y, { button });
  const tapAt = ({ x, y }) => page.touchscreen.tap(x, y);
  const trayEntry = async (id) => (await playLayout(page)).tray.find((entry) => entry.id === id);
  for (const id of [left, right]) {
    const entry = await trayEntry(id);
    for (let turns = puzzle.orientationOf(id); turns % 4; turns++) await tapAt(entry);
  }

  await clickAt(await trayEntry(left), 'right');
  await clickAt(initial.boardPoint(-96, 72), 'right');
  assert.deepEqual((await playLayout(page)).parked.map(({ id }) => id), [left]);
  await clickAt(await trayEntry(right), 'right');
  await clickAt(initial.boardPoint(32, 72), 'left');
  const joined = await playLayout(page);
  assert.equal(joined.parked.length, 2);
  assert.deepEqual(joined.parkedBorders, joined.parked.map(({ x, y, angle }) => ({
    x, y, angle, tint: 0x71897e,
  })), 'Each member of the parked group has a Forest-themed border');
  const parked = (layout, id) => layout.parked.find((entry) => entry.id === id);
  assert.equal(parked(joined, right).x - parked(joined, left).x, 128, 'The over-guide drop joins at the exact offset');
  assert.ok(joined.parked.every(({ angle }) => angle === 0), 'Neither drop button rotates the group');
  const joinedSave = await readSave(page);
  assert.deepEqual(joinedSave.progress.Windmill.placedPieceIds, []);
  assert.deepEqual(joinedSave.progress.Windmill.parkedGroups.map(({ memberIds }) => memberIds), [[left, right]]);
  assert.ok(!Object.hasOwn(joinedSave.progress.Windmill.trayOrientations, left));
  await page.reload();
  await waitForText('0 of 8 placed');
  await page.touchscreen.tap(340, 180);
  await waitForText('Resume');
  await clickDialog(100, resumeActionY);
  assert.deepEqual((await playLayout(page)).parked, joined.parked);
  assert.deepEqual(await readSave(page), joinedSave, 'Resuming the parked group does not rewrite it');

  const overlapId = 'piece-1-3';
  await clickAt(await trayEntry(overlapId), 'right');
  const overlapAt = joined.boardPoint(parked(joined, right).x, parked(joined, right).y);
  await clickAt(overlapAt, 'right');
  assert.equal((await playLayout(page)).parked.at(-1).id, overlapId);
  await clickAt(overlapAt, 'right');
  await clickAt(joined.tray[0], 'right');
  assert.deepEqual((await playLayout(page)).parked, joined.parked, 'The topmost outline receives input without disturbing the group below');

  const { board } = joined;
  await page.mouse.move(board.x + board.width - 80, board.y + board.height / 2);
  await page.mouse.wheel(0, -900);
  const zoomed = await playLayout(page);
  const pieceOnScreen = (layout, id) => {
    const { x, y } = parked(layout, id);
    return layout.boardPoint(x, y);
  };
  assert.ok(pieceOnScreen(zoomed, left).x < board.x, 'Zoom can take the off-guide piece out of view');
  const panY = board.y + board.height * 0.75;
  let panNeeded = board.x + 220 - pieceOnScreen(zoomed, left).x;
  while (panNeeded > 0) {
    const distance = Math.min(panNeeded, board.width - 100);
    await moveFinger(board.x + 40, panY, board.x + 40 + distance, panY);
    panNeeded -= distance;
  }
  const recovered = await playLayout(page);
  const leftOnScreen = pieceOnScreen(recovered, left);
  assert.ok(leftOnScreen.x > board.x + 200 && leftOnScreen.x < board.x + board.width,
    'Panning can recover the off-guide piece beyond the guide-only pan limit');

  const { x, y } = pieceOnScreen(recovered, right);
  await setAllowLoosePiecesOnBoard(false);
  assert.deepEqual((await readSave(page)).progress.Windmill, joinedSave.progress.Windmill);
  await moveFinger(x, y, x + 40, y + 100);
  assert.deepEqual((await playLayout(page)).parked, recovered.parked, 'An unmatched drop restores the group pose when loose pieces are disabled');
  await moveFinger(x, y, x + 40, y + 100, 'touchCancel');
  assert.deepEqual((await playLayout(page)).parked, recovered.parked, 'Touch cancellation restores both members');
  await dispatch('touchStart', [x, y]);
  await dispatch('touchMove', [x + 20, y + 24]);
  await dispatch('touchStart', [x + 20, y + 24], [x + 160, y + 24]);
  await dispatch('touchMove', [x + 40, y + 24], [x + 140, y + 24]);
  await dispatch('touchEnd');
  const pinched = await playLayout(page);
  assert.ok(pinched.board.zoom < recovered.board.zoom, 'A second touch takes over the active piece drag to pinch');
  assert.deepEqual(pinched.parked, recovered.parked, 'Pinch does not commit the preview');

  await setAllowLoosePiecesOnBoard(true);
  const pivot = pieceOnScreen(pinched, right);
  const grabbed = { x: pivot.x + 20, y: pivot.y };
  const destination = { x: grabbed.x - 100, y: grabbed.y + 90 };
  await page.mouse.move(grabbed.x, grabbed.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 8 });
  const lifted = await playLayout(page);
  assert.equal(lifted.parkedBorders.length, 0);
  assert.equal(lifted.liftedBorders, 2, 'Both borders travel with the group');
  assert.equal(lifted.liftShadows.length, 2, 'Every lifted member casts a shadow');
  assert.ok(Math.abs(lifted.liftShadows[1].x - lifted.liftShadows[0].x - 128 * lifted.board.zoom) < 1,
    'The shadows follow the distance between members at the current zoom');
  assert.deepEqual((await readSave(page)).progress.Windmill, joinedSave.progress.Windmill, 'A drag preview does not save');
  await page.mouse.up();
  const moved = await playLayout(page);
  assert.deepEqual(moved.liftShadows, [], 'Shadows disappear when the group is parked again');
  const movedPivot = pieceOnScreen(moved, right);
  assert.ok(Math.abs(movedPivot.x - (destination.x - 20)) < 2 && Math.abs(movedPivot.y - destination.y) < 2,
    'The zoomed drop preserves the grab point on the group');
  assert.equal(parked(moved, right).x - parked(moved, left).x, 128);
  await tapAt(movedPivot);
  const turned = await playLayout(page);
  assert.deepEqual(parked(turned, right), { ...parked(moved, right), angle: 90 });
  assert.deepEqual(parked(turned, left), {
    ...parked(moved, left), x: parked(turned, right).x, y: parked(turned, right).y - 128, angle: 90,
  }, 'Touch rotation pivots around the tapped member');
  const { x: anchorX, y: anchorY } = parked(turned, right);
  assert.deepEqual((await readSave(page)).progress.Windmill.parkedGroups, [{
    memberIds: [left, right], anchorPieceId: right, position: { x: anchorX, y: anchorY }, quarterTurns: 1,
  }]);

  const grab = pieceOnScreen(turned, right);
  const slot = turned.tray.at(-1);
  await moveFinger(grab.x, grab.y, slot.x, slot.y);
  const returned = await playLayout(page);
  assert.deepEqual(returned.parked, []);
  assert.deepEqual(returned.parkedBorders, []);
  assert.equal(returned.liftedBorders, 0, 'Returning the group removes its parked borders');
  assert.deepEqual(returned.tray.map(({ id }) => id), seededOrder);
  const progress = (await readSave(page)).progress.Windmill;
  assert.equal(progress.trayOrientations[left], 1);
  assert.equal(progress.trayOrientations[right], 1);
  assert.deepEqual(progress.placedPieceIds, []);
  assert.deepEqual(progress.parkedGroups, []);
  assert.deepEqual(errors, []);
});

scenario('break piece off targets the topmost member and splits a bridge on touch or mouse input', async (t) => {
  const { page, canvas, waitForText, errors, playSelection } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const { dispatch, moveFinger } = await touchController(page);
  await page.touchscreen.tap(340, 180);
  await playSelection({ connectorStyle: 'None', pieceRotation: true });
  await waitForText('0 of 8 placed');
  await dragDivider(page, moveFinger, { x: 552 });
  const layout = () => playLayout(page);
  const initial = await layout();
  assert.equal(initial.breakButton.visible, false);
  const puzzle = createPuzzle(compactSize, 'none', 233, 'none', true);
  const chain = ['piece-0-0', 'piece-0-1', 'piece-0-2', 'piece-0-3'];
  const [left, bridge, inner, end] = chain;
  const cover = 'piece-1-3';
  const clickAt = ({ x, y }, button = 'left') => page.mouse.click(x, y, { button });
  const tapAt = ({ x, y }) => page.touchscreen.tap(x, y);
  const buttonCenter = ({ x, y, width, height }) => ({ x: x + width / 2, y: y + height / 2 });
  const trayEntry = async (id) => (await layout()).tray.find((entry) => entry.id === id);
  const screenPiece = (state, id) => {
    const { x, y } = state.parked.find((entry) => entry.id === id);
    return state.boardPoint(x, y);
  };
  const waitForDetachedPiece = async (id) => {
    const { position } = (await readSave(page)).progress.Windmill.parkedGroups.find(({ anchorPieceId }) => anchorPieceId === id);
    await page.waitForFunction(({ id, x, y }) => {
      const scene = window.puzzleArtworkScene.sys.game.scene.getScene('PlayPuzzle');
      const camera = scene.cameras.getCamera('Puzzle board');
      const layer = scene.children.list.find((object) => object.type === 'Layer' && !(object.cameraFilter & camera.id));
      const piece = layer.list.find(({ frame }) => frame?.name === id);
      return piece?.x === x && piece.y === y;
    }, { id, ...position });
    return layout();
  };
  for (const [column, id] of chain.entries()) {
    const entry = await trayEntry(id);
    for (let turns = puzzle.orientationOf(id); turns % 4; turns++) await tapAt(entry);
    await clickAt(entry, 'right');
    await clickAt(initial.boardPoint(38 + 128 * column, 144));
  }
  const joined = await layout();
  assert.deepEqual(joined.parked.map(({ id }) => id), chain);
  assert.equal(joined.breakButton.visible, true);
  assert.equal(joined.breakButton.width, joined.nativeSizeButton.width);
  assert.equal(joined.breakButton.height, joined.nativeSizeButton.height);
  assert.ok(joined.breakButton.x >= joined.board.x && joined.breakButton.x < joined.board.x + 20);
  assert.equal(joined.breakButton.y - joined.board.y, joined.breakButton.x - joined.board.x);
  const button = buttonCenter(joined.breakButton);
  const bridgePoint = screenPiece(joined, bridge);
  const cursor = () => canvas.evaluate((element) => getComputedStyle(element).cursor);

  await clickAt(await trayEntry(cover), 'right');
  await clickAt(bridgePoint);
  const overlapped = await layout();
  assert.equal(overlapped.parked.at(-1).id, cover);
  await clickAt(button);
  assert.equal((await layout()).breakButton.armed, true);
  const expectedScissors = /^url\("data:image\/svg\+xml,.*\) 12 12, crosshair$/;
  const blankBoard = { x: joined.board.x + joined.board.width - 10, y: joined.board.y + joined.board.height - 10 };
  await page.mouse.move(blankBoard.x, blankBoard.y);
  assert.match(await cursor(), expectedScissors, 'The armed tool shows scissors even over empty board space');
  await page.mouse.down();
  assert.equal(await cursor(), 'grabbing');
  await page.mouse.up();
  assert.match(await cursor(), expectedScissors, 'Releasing a pan restores scissors');
  await page.mouse.move(joined.divider.x, joined.divider.y);
  assert.equal(await cursor(), 'ew-resize');
  await page.mouse.move(joined.tray[0].x, joined.tray[0].y);
  assert.equal(await cursor(), 'default');
  await clickAt(bridgePoint);
  const masked = await layout();
  assert.deepEqual(masked.parked, overlapped.parked, 'A topmost singleton blocks the joined member beneath');
  assert.equal(masked.breakButton.armed, true);
  await clickAt(button);
  assert.equal((await layout()).breakButton.armed, false);
  await page.mouse.move(blankBoard.x, blankBoard.y);
  assert.equal(await cursor(), 'default');

  const pivot = screenPiece(joined, left);
  await clickAt(pivot);
  const rotated = await layout();
  assert.deepEqual(rotated.parked.map(({ id }) => id), [cover, ...chain], 'Rotating raises the full group above the cover');
  assert.equal(rotated.parked.at(-1).angle, 90);
  await clickAt(bridgePoint, 'right');
  await clickAt(joined.tray[0]);
  for (let turns = 1; turns < 4; turns++) await clickAt(pivot);
  assert.deepEqual((await layout()).parked, joined.parked);

  await tapAt(button);
  await dispatch('touchStart', [bridgePoint.x, bridgePoint.y]);
  await dispatch('touchCancel');
  const cancelled = await layout();
  assert.equal(cancelled.breakButton.armed, false);
  assert.deepEqual(cancelled.parked, joined.parked);
  await tapAt(button);
  await moveFinger(bridgePoint.x, bridgePoint.y, bridgePoint.x, bridgePoint.y + 40);
  const dragged = await layout();
  assert.equal(dragged.breakButton.armed, false);
  assert.deepEqual(dragged.parked, joined.parked, 'Dragging an armed contact has no piece side effects');

  await tapAt(button);
  const { x, y } = bridgePoint;
  await dispatch('touchStart', [x, y]);
  await dispatch('touchStart', [x, y], [x + 80, y]);
  await dispatch('touchMove', [x - 10, y], [x + 90, y]);
  await dispatch('touchEnd');
  const pinched = await layout();
  assert.ok(pinched.board.zoom > joined.board.zoom);
  assert.equal(pinched.breakButton.armed, true, 'Pinching while pressing a member keeps break mode armed');
  assert.deepEqual(pinched.parked, joined.parked, 'Pinch handoff does not detach or move a piece');

  const pinchedBridge = screenPiece(pinched, bridge);
  await tapAt(pinchedBridge);
  const split = await waitForDetachedPiece(bridge);
  assert.equal(split.breakButton.armed, false);
  assert.deepEqual(split.parked.slice(0, -1), [0, 2, 3].map((index) => joined.parked[index]));
  const detached = split.parked.at(-1);
  assert.deepEqual(detached, { ...joined.parked[1], y: detached.y }, 'Only the bridge moves, without rotating');
  const detachDistance = (puzzle.snapTolerance + 6) / 2;
  assert.equal(detached.y, joined.parked[1].y - detachDistance, 'The bridge moves away from both neighbors');
  assert.ok(split.parkedBorders.some(({ x, y }) => x === detached.x && y === detached.y));
  assert.deepEqual((await readSave(page)).progress.Windmill.parkedGroups.map(({ memberIds }) => memberIds),
    [[left], [inner, end], [bridge]], 'The saved workspace records each remaining component separately');
  await clickAt(screenPiece(split, bridge), 'right');
  await clickAt(split.tray[0]);
  assert.deepEqual((await layout()).parked.map(({ id }) => id), [left, inner, end], 'Only the detached bridge returns');

  await clickAt(button);
  await page.keyboard.press('Escape');
  assert.equal((await layout()).breakButton.armed, false);
  await clickAt(button);

  const beforeFit = await layout();
  assert.equal(beforeFit.fitButton.visible, true);
  await tapAt(buttonCenter(beforeFit.fitButton));
  const fitted = await layout();
  assert.equal(fitted.fitButton.visible, false);
  assert.equal(fitted.breakButton.armed, true, 'Fit board keeps break mode armed');

  const { board } = fitted;
  await page.mouse.move(board.x + board.width / 2, board.y + board.height / 2);
  await page.mouse.wheel(0, 200);
  const wheeled = await layout();
  assert.ok(wheeled.board.zoom < board.zoom);
  assert.equal(wheeled.breakButton.armed, true, 'Wheel zoom keeps break mode armed');

  assert.equal(wheeled.nativeSizeButton.visible, true);
  await tapAt(buttonCenter(wheeled.nativeSizeButton));
  const native = await layout();
  assert.equal(native.board.zoom, 1);
  assert.equal(native.breakButton.armed, true, '1× keeps break mode armed');
  const endPoint = screenPiece(native, end);
  await clickAt(endPoint);
  const singles = await waitForDetachedPiece(end);
  assert.equal(singles.breakButton.visible, false);
  assert.equal(await cursor(), 'default', 'Detaching a piece clears the scissors cursor');
  assert.deepEqual(singles.parked.slice(0, -1), split.parked.slice(0, 2));
  const detachedEnd = singles.parked.at(-1);
  assert.deepEqual(detachedEnd, { ...joined.parked[3], x: detachedEnd.x }, 'A mouse click detaches without rotating');
  assert.equal(detachedEnd.x, joined.parked[3].x + detachDistance, 'The end moves directly away from its neighbor');

  await clickAt(screenPiece(singles, end), 'right');
  await clickAt(singles.boardPoint(joined.parked[3].x, joined.parked[3].y));
  assert.equal((await layout()).breakButton.visible, true, 'A later drop can rejoin the pieces');
  await clickAt(screenPiece(await layout(), end), 'right');
  await page.evaluate(() => {
    const scene = window.puzzleArtworkScene.sys.game.scene.getScene('PlayPuzzle');
    const camera = scene.cameras.getCamera('Puzzle board');
    const layer = scene.children.list.find((object) => object.type === 'Layer' && !(object.cameraFilter & camera.id));
    scene.input.once('pointerdown', () => {
      const highlight = layer.list.find(({ name }) => name === 'Placement edge highlight');
      const points = [[256, 72], [384, 72], [512, 72], [320, 0], [448, 0], [320, 144], [448, 144]];
      window.groupPlacementEdgeAlpha = highlight ? points.map(([x, y]) => {
        const column = Math.floor((x - highlight.x) / highlight.scaleX + highlight.displayOriginX);
        const row = Math.floor((y - highlight.y) / highlight.scaleY + highlight.displayOriginY);
        return highlight.texture.context.getImageData(column, row, 1, 1).data[3];
      }) : [];
    });
  });
  await clickAt(pieceTarget(await layout(), end));
  await waitForText('2 of 8 placed');
  const edgeAlpha = await page.evaluate(() => window.groupPlacementEdgeAlpha);
  assert.equal(edgeAlpha.length, 7);
  assert.ok(edgeAlpha.every((alpha) => alpha > 128), `The outer edges and shared seam all light up: ${edgeAlpha}`);
  const placed = await layout();
  assert.deepEqual(placed.parked.map(({ id }) => id), [left]);
  assert.equal(placed.parkedBorders.length, 1, 'Only the remaining parked piece keeps its border');
  assert.equal(placed.liftedBorders, 0);
  assert.equal(placed.breakButton.visible, false);
  assert.deepEqual((await readSave(page)).progress.Windmill.placedPieceIds, [inner, end]);
  assert.deepEqual(errors, []);
});

scenario('Sequential locks tray pieces while keeping touch scrolling and saves the active order', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const { moveFinger } = await touchController(page);
  await page.touchscreen.tap(340, 180);
  await playSelection({ connectorStyle: 'None', challengeMode: 'sequential' });
  await waitForText('0 of 8 placed');
  await uiControl(page, { name: 'Challenge rules' });
  const save = () => readSave(page);
  assert.equal((await save()).recentOptions.challengeMode, 'sequential');
  assert.equal((await save()).progress.Windmill, undefined);

  const firstSlot = async () => pixelAt(page, await canvas.screenshot(), 75, 136);
  const firstColor = await firstSlot();
  const lockedColor = await pixelAt(page, await canvas.screenshot(), 75, 239);
  assert.equal(lockedColor[0], lockedColor[1], 'A disabled piece should be grayscale');
  assert.equal(lockedColor[1], lockedColor[2]);
  assert.notEqual(firstColor[0], firstColor[1], 'An available piece should keep its colors');
  await moveFinger(75, 239, 75, 136);
  assert.notDeepEqual(await firstSlot(), firstColor, 'A swipe on a disabled piece should scroll');
  await moveFinger(75, 136, 75, 239);
  assert.deepEqual(await firstSlot(), firstColor);

  await dragDivider(page, moveFinger, { x: 552 });
  const layout = await playLayout(page);
  const [active, locked] = layout.tray;
  const firstTarget = cellCenter(layout, 2, 1);
  const secondTarget = cellCenter(layout, 3, 0);
  await page.mouse.move(locked.x, locked.y);
  await page.mouse.down();
  await page.mouse.move(secondTarget.x, secondTarget.y, { steps: 6 });
  await page.mouse.up();
  assert.equal((await save()).progress.Windmill, undefined, 'A disabled piece should not lift with the mouse');
  await moveFinger(active.x, active.y, firstTarget.x, firstTarget.y, 'touchCancel');
  assert.equal((await save()).progress.Windmill, undefined);
  assert.deepEqual(await firstSlot(), firstColor, 'Cancellation should return the same active piece');
  await moveFinger(active.x, active.y, firstTarget.x, firstTarget.y);
  await waitForText('1 of 8 placed');
  const attempt = (await save()).progress.Windmill;
  assert.equal(attempt.setup.challengeMode, 'sequential');
  assert.deepEqual(attempt.placedPieceIds, ['piece-1-2']);
  const nextColor = await firstSlot();
  assert.notEqual(nextColor[0], nextColor[1]);

  await page.reload();
  await waitForText('Windmill');
  await page.touchscreen.tap(340, 180);
  await waitForText('Resume');
  await clickDialog(100, resumeActionY);
  assert.deepEqual(await firstSlot(), nextColor);
  const resumed = await playLayout(page);
  const next = resumed.tray[0];
  const resumedTarget = cellCenter(resumed, 3, 0);
  await moveFinger(next.x, next.y, resumedTarget.x, resumedTarget.y);
  await waitForText('2 of 8 placed');
  assert.deepEqual((await save()).progress.Windmill.placedPieceIds, ['piece-1-2', 'piece-0-3']);
  assert.deepEqual(errors, []);
});

scenario('Seed returns loose pieces when cut off or when the seed is placed', async (t) => {
  const { page, waitForText, errors, playSelection } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const { moveFinger } = await touchController(page);
  await page.touchscreen.tap(340, 180);
  await playSelection({ connectorStyle: 'None', challengeMode: 'seed' });
  await waitForText('0 of 8 placed');
  await dragDivider(page, moveFinger, { x: 552 });

  const [left, right, seed] = ['piece-0-0', 'piece-0-1', 'piece-0-2'];
  const dropFromTray = async (id, x, y) => {
    const state = await playLayout(page);
    const entry = state.tray.find((entry) => entry.id === id);
    const target = state.boardPoint(x, y);
    await moveFinger(entry.x, entry.y, target.x, target.y);
  };

  await dropFromTray(left, 38, 144);
  await dropFromTray(right, 38, 144);
  assert.deepEqual((await playLayout(page)).parked.map(({ id }) => id), [left]);
  await dropFromTray(right, 166, 144);
  const joined = await playLayout(page);
  assert.deepEqual(joined.parked.map(({ id }) => id), [left, right]);
  const scissors = joined.breakButton;
  await page.touchscreen.tap(scissors.x + scissors.width / 2, scissors.y + scissors.height / 2);
  const cut = joined.boardPoint(166, 144);
  await page.touchscreen.tap(cut.x, cut.y);
  const split = await playLayout(page);
  assert.deepEqual(split.parked, joined.parked.slice(0, 1));
  assert.ok(split.tray.some(({ id }) => id === right));
  assert.equal(split.breakButton.visible, false);
  assert.equal(split.moveTrayButton.visible, false, 'Seed must hide bulk parking with a nonempty tray');
  assert.equal(split.sortButton.visible, false, 'Seed must hide Sort even with a parked edge');
  assert.deepEqual((await readSave(page)).progress.Windmill.parkedGroups.map(({ memberIds }) => memberIds), [[left]]);

  await dropFromTray(seed, 320, 72);
  await waitForText('1 of 8 placed');
  await dropFromTray(right, 166, 144);
  const afterPlacement = await playLayout(page);
  assert.deepEqual(afterPlacement.parked, []);
  assert.ok(afterPlacement.tray.some(({ id }) => id === left));
  assert.ok(afterPlacement.tray.some(({ id }) => id === right));
  const saved = (await readSave(page)).progress.Windmill;
  assert.deepEqual(saved.placedPieceIds, [seed]);
  assert.deepEqual(saved.parkedGroups, []);
  assert.deepEqual(errors, []);
});

scenario('Seed previews an on-target disconnected drop without saving it', async (t) => {
  const { page, canvas, waitForText, errors, playSelection, setAllowLoosePiecesOnBoard } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const { moveFinger } = await touchController(page);
  const message = 'Piece must be connected to seed group';
  await setAllowLoosePiecesOnBoard(false);
  await page.touchscreen.tap(340, 180);
  await playSelection({ connectorStyle: 'None', challengeMode: 'seed' });
  await waitForText('0 of 8 placed');
  await dragDivider(page, moveFinger, { x: 552 });
  const layout = await playLayout(page);
  const first = layout.tray[0];
  const firstTarget = cellCenter(layout, 2, 1);
  await moveFinger(first.x, first.y, firstTarget.x, firstTarget.y);
  await waitForText('1 of 8 placed');
  const saved = await readSave(page);
  assert.deepEqual(saved.progress.Windmill.placedPieceIds, ['piece-1-2']);

  const next = (await playLayout(page)).tray[0];
  const miss = cellCenter(layout, 2, 0);
  await moveFinger(next.x, next.y, miss.x, miss.y);
  assert.equal(await page.evaluate((text) => window.paintedText.includes(text), message), false,
    'An ordinary miss should not show a rule warning');

  const anchor = cellCenter(layout, 3, 0);
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.wheel(0, -200);
  const zoomed = await playLayout(page);
  const target = cellCenter(zoomed, 3, 0);
  const before = await canvas.screenshot();
  await page.mouse.move(next.x, next.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  const preview = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, preview, target.x, target.y), await pixelAt(page, before, target.x, target.y),
    'The rejected piece should briefly appear at its target on the zoomed board');
  const { width, data } = PNG.sync.read(preview);
  const edge = Math.floor(zoomed.boardPoint(384, 0).x);
  const hasRedOutline = [-2, -1, 0, 1, 2].some((offset) => {
    const [red, green, blue] = data.subarray((Math.floor(target.y) * width + edge + offset) * 4);
    return red > Math.max(green, blue) + 40;
  });
  assert.ok(hasRedOutline, 'The preview should have a red outline');
  await waitForText(message);
  assert.deepEqual(await readSave(page), saved, 'A rejected drop should not save or change progress');

  const targetBefore = await pixelAt(page, before, target.x, target.y);
  const returnDeadline = Date.now() + 2000;
  let returned;
  let after;
  do {
    after = await canvas.screenshot();
    returned = await pixelAt(page, after, target.x, target.y);
  } while (returned.some((channel, i) => channel !== targetBefore[i]) && Date.now() < returnDeadline);
  assert.deepEqual(returned, targetBefore, 'The preview should disappear after the pulse');
  assert.deepEqual(await pixelAt(page, after, 660, 756), [71, 37, 42, 255],
    'The screen-space toast should still be visible after the preview ends');

  const neighbor = zoomed.tray.find(({ id }) => id === 'piece-1-3');
  const neighborTarget = cellCenter(zoomed, 3, 1);
  await moveFinger(neighbor.x, neighbor.y, neighborTarget.x, neighborTarget.y);
  await waitForText('2 of 8 placed');
  await moveFinger(next.x, next.y, target.x, target.y);
  await waitForText('3 of 8 placed');
  assert.deepEqual((await readSave(page)).progress.Windmill.placedPieceIds, ['piece-1-2', 'piece-1-3', 'piece-0-3']);
  assert.deepEqual(errors, []);
});

scenario('No Guide progress resumes, resets, and records each completion', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  const pickWindmill = () => clickDialog(-320, -210);
  const backToPicker = async () => {
    await page.evaluate(() => { window.paintedText = []; });
    await pressHeader(page, 'All puzzles');
    await waitForPicker(page);
  };
  const drag = async (x, y, targetX, targetY) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 6 });
    await page.mouse.up();
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const widenTray = () => dragDivider(page, drag, { x: 552 });
  const pieceCount = compactSize.columns * compactSize.rows;
  const getAttempt = async () => (await readSave(page)).progress.Windmill;
  const getHistory = async () => (await readSave(page)).history.Windmill ?? [];
  const placeNextPiece = async () => {
    const placedCount = (await getAttempt())?.placedPieceIds.length ?? 0;
    const completedCount = (await getHistory()).length;
    const layout = await playLayout(page);
    const { id, x, y } = layout.tray[0];
    const target = pieceTarget(layout, id);
    await drag(x, y, target.x, target.y);
    assert.ok((await getAttempt())?.placedPieceIds.length > placedCount || (await getHistory()).length > completedCount,
      'The first tray piece should snap at its target');
    return { ...target, id };
  };

  assert.equal(await page.evaluate(() => window.paintedText.some((text) =>
    text === 'Completed' || /^\d+ of \d+ placed$/.test(text))), false, 'Untouched puzzles should have no status');
  await pickWindmill();
  await playSelection({ connectorStyle: 'None', animationSpeed: 'Fast', challengeMode: 'no-guide' });
  await waitForText('0 of 8 placed');
  assert.equal(await getAttempt(), undefined);
  await backToPicker();
  await pickWindmill();
  await playSelection();
  await waitForText('0 of 8 placed');
  assert.equal(await page.evaluate(() => window.paintedText.includes('Resume')), false);
  await widenTray();
  const layout = await playLayout(page);
  const emptyCell = cellCenter(layout, 0, 0);
  const guide = await canvas.screenshot();
  const boardBackground = [32, 46, 42, 255];
  assert.deepEqual(await pixelAt(page, guide, emptyCell.x, emptyCell.y), boardBackground);
  assert.deepEqual(await pixelAt(page, guide, Math.floor(layout.artwork.x), 400), [113, 137, 126, 255], 'A border should mark the puzzle bounds');
  await pressHeader(page, 'Settings');
  await waitForText('Black and White');
  await pressSetting(page, 'Slate');
  await pressSetting(page, 'Black and White');
  await pressSetting(page, 'Done');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), emptyCell.x, emptyCell.y), [33, 44, 59, 255],
    'Theme and filter changes should keep the guide hidden');
  await pressHeader(page, 'Settings');
  await waitForText('Color theme');
  await pressSetting(page, 'Forest');
  await pressSetting(page, 'Done');
  const firstTarget = await placeNextPiece();
  const firstSave = await getAttempt();
  assert.deepEqual(firstSave.placedPieceIds, [firstTarget.id]);
  assert.equal(firstSave.setup.connectorStyle, 'none');
  assert.equal(firstSave.setup.animationSpeed, 'Fast');
  assert.equal(firstSave.setup.challengeMode, 'no-guide');
  assert.deepEqual(firstSave.setup.size, { width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 });
  assert.ok(Number.isInteger(firstSave.setup.seed));
  const placedColor = await pixelAt(page, await canvas.screenshot(), firstTarget.x, firstTarget.y);
  assert.notDeepEqual(placedColor, await pixelAt(page, guide, firstTarget.x, firstTarget.y));

  await page.reload();
  await waitForPicker(page);
  await pickWindmill();
  await waitForText('Resume');
  const resumeText = await page.evaluate(() => window.paintedText);
  for (const line of ['1 of 8 placed', 'Puzzle size: 8', 'Connector style: None',
    'Animation speed: Fast', 'Challenge mode: No Guide']) {
    assert.ok(resumeText.includes(line), `The resume dialog should show ${line}`);
  }
  assert.ok(!resumeText.includes('1 of 8 pieces placed'));
  await clickDialog(-6, resumeActionY);
  await waitForText('Piece count');
  await clickControl(page, { text: '32' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(await getAttempt(), firstSave);
  assert.deepEqual((await readSave(page)).recentOptions, {
    pieceCount: 8, pieceShape: 'vertical-short', connectorStyle: 'none', animationSpeed: 'Fast', challengeMode: 'no-guide', pieceRotation: false,
  });
  await page.evaluate(() => { window.paintedText = []; });
  await pickWindmill();
  await waitForText('Resume');
  await page.evaluate(() => { window.paintedText = []; });
  await clickDialog(100, resumeActionY);
  await waitForText('1 of 8 placed');
  await uiControl(page, { name: 'Challenge rules' });
  await widenTray();
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), firstTarget.x, firstTarget.y), placedColor);
  for (let count = 1; count < pieceCount; count += 1) await placeNextPiece();
  await waitForText('8 of 8 placed');
  const findBoardEdge = (screenshot) => {
    const { width, data } = PNG.sync.read(screenshot);
    for (let x = 24; x < width; x += 1) {
      const offset = (105 * width + x) * 4;
      if (data[offset] === 32 && data[offset + 1] === 46 && data[offset + 2] === 42) return x;
    }
    assert.fail('Expected to find the board background');
  };
  const startingEdge = findBoardEdge(guide);
  let sliding = await canvas.screenshot();
  if (findBoardEdge(sliding) === startingEdge) sliding = await canvas.screenshot();
  const boardEdge = findBoardEdge(sliding);
  assert.ok(boardEdge > 24 && boardEdge < startingEdge, 'The board should grow while the tray is still sliding away');
  await uiControl(page, { name: 'All puzzles', primary: false });
  assert.equal(await getAttempt(), undefined);
  assert.deepEqual((await getHistory()).map(({ setup }) => setup), [firstSave.setup]);
  await uiControl(page, { name: 'All puzzles', primary: true });
  const finished = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, finished, 75, 136), [32, 46, 42, 255], 'The board should reclaim the empty tray');
  assert.deepEqual(await pixelAt(page, finished, 470, 305), [192, 221, 219, 255], 'The finished artwork should be centered in the reclaimed space');
  const windmill = () => page.screenshot({ clip: { x: 597, y: 364, width: 126, height: 126 } });
  const sails = await windmill();
  await page.waitForTimeout(150);
  assert.ok(!sails.equals(await windmill()), 'The finished puzzle should continue animating');

  await backToPicker();
  await waitForText('Completed');
  await pickWindmill();
  await playSelection();
  await waitForText('0 of 8 placed');
  await widenTray();
  await placeNextPiece();
  await backToPicker();
  await waitForText('1 of 8 placed');
  assert.equal(await page.evaluate(() => window.paintedText.includes('Completed')), false,
    'A saved attempt should take priority over completion history');
  await pickWindmill();
  await waitForText('Resume');
  await clickDialog(-6, resumeActionY);
  await playSelection();
  await waitForText('0 of 8 placed');
  assert.equal(await getAttempt(), undefined);
  assert.equal((await getHistory()).length, 1);
  await widenTray();
  await placeNextPiece();
  const freshSetup = (await getAttempt()).setup;
  for (let count = 1; count < pieceCount; count += 1) await placeNextPiece();
  await waitForText('8 of 8 placed');
  await page.reload();
  await waitForText('Completed');
  assert.deepEqual((await getHistory()).map(({ setup }) => setup), [firstSave.setup, freshSetup]);
  assert.ok((await getHistory()).every(({ completedAt }) => Number.isFinite(Date.parse(completedAt))));

  await page.evaluate((attempt) => {
    const key = 'live-jigsaw.save';
    const save = JSON.parse(localStorage.getItem(key));
    save.progress.Windmill = { ...attempt, placedPieceIds: ['unknown-piece'] };
    save.history.Windmill.push({ setup: null });
    localStorage.setItem(key, JSON.stringify(save));
  }, firstSave);
  await page.reload();
  await waitForText('Completed');
  await pickWindmill();
  await waitForText('Piece count');
  assert.equal(await page.evaluate(() => window.paintedText.includes('Resume')), false);
  assert.deepEqual(errors, []);
});

scenario('picker tag and completion filters combine and refresh after play', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog } = await openCompactPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  const setup = {
    size: { width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 },
    seed: 42, connectorStyle: 'none', animationSpeed: 'Normal', challengeMode: 'none', pieceRotation: false,
  };
  const original = {
    version: saveVersion,
    settings: { trayFractions: { vertical: 0, horizontal: 0 }, allowLoosePiecesOnBoard: false },
    progress: {
      Lighthouse: { setup, placedPieceIds: ['piece-0-0'], trayOrientations: {}, parkedGroups: [] },
      Windmill: {
        setup,
        placedPieceIds: ['piece-0-1', 'piece-0-2', 'piece-0-3', 'piece-1-0', 'piece-1-1', 'piece-1-2', 'piece-1-3'],
        trayOrientations: {},
        parkedGroups: [],
      },
    },
    history: { Lighthouse: [{ setup, completedAt: '2025-01-01T12:00:00.000Z' }] },
  };
  await page.evaluate((save) => localStorage.setItem('live-jigsaw.save', JSON.stringify(save)), original);
  await page.reload();
  await waitForText('Countryside · Flat Illustration');
  await waitForText('Coast · Flat Illustration');

  const clickFilters = paceRepeatClicks(() => pressHeader(page, 'Filters'));
  const openFilters = async () => {
    await clickFilters();
    await waitForText('Completion');
  };
  const pickFirst = async (x = 340) => {
    await page.evaluate(() => { window.paintedText = []; });
    await clickDialog(x - 660, -210);
  };
  const drag = async (fromX, fromY, toX, toY) => {
    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(toX, toY, { steps: 8 });
    await page.mouse.up();
  };

  await openFilters();
  await clickDialog(93, filterY.firstTheme); // Coast
  await clickDialog(-119, filterY.secondTheme); // Countryside
  const selectedTiles = await canvas.screenshot();
  const selectedFill = [75, 108, 94, 255];
  assert.deepEqual(await pixelAt(page, selectedTiles, 753, 390 + filterY.firstTheme - 14), selectedFill, 'Coast should use the selected tile fill');
  assert.deepEqual(await pixelAt(page, selectedTiles, 541, 390 + filterY.secondTheme - 14), selectedFill, 'Countryside should stay selected alongside Coast');
  await clickDialog(-109, filterY.type); // Flat Illustration
  await clickDialog(-66, filterY.completion); // Completed
  await clickDialog(125, filterY.action);
  await waitForFilterCount(page, 4);
  assert.deepEqual(await readSave(page), original);
  await pickFirst(660);
  await waitForText('Lighthouse');
  await waitForText('Resume');
  await page.keyboard.press('Escape');

  await openFilters();
  await clickDialog(-61, filterY.action); // Clear the draft
  await clickDialog(29, filterY.action); // Cancel
  await pickFirst(660);
  await waitForText('Lighthouse');
  await page.keyboard.press('Escape');

  await openFilters();
  await clickDialog(-61, filterY.action);
  await clickDialog(93, filterY.firstTheme); // Coast
  await clickDialog(2, filterY.type); // Parallax
  await clickDialog(125, filterY.action);
  await waitForText('No puzzles match your filters');
  const emptyImage = PNG.sync.read(await canvas.screenshot());
  const centerOfVisibleContent = (startY, endY) => {
    let left = emptyImage.width;
    let right = -1;
    let top = emptyImage.height;
    let bottom = -1;
    for (let y = startY; y < endY; y += 1) {
      const background = emptyImage.data.subarray(y * emptyImage.width * 4, y * emptyImage.width * 4 + 4);
      for (let x = 400; x < 920; x += 1) {
        const pixel = (y * emptyImage.width + x) * 4;
        if (emptyImage.data.subarray(pixel, pixel + 4).equals(background)) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    assert.ok(left < right && top < bottom, 'The empty state element should be visible');
    return { x: (left + right) / 2, y: (top + bottom) / 2 };
  };
  const message = centerOfVisibleContent(120, 146);
  const button = centerOfVisibleContent(150, 208);
  assert.ok(Math.abs(message.x - button.x) < 2 && Math.abs(button.x - emptyImage.width / 2) < 2,
    'The stacked message and Clear filters button should share the center line of the picker');
  await page.mouse.click(button.x, button.y);

  await openFilters();
  await clickDialog(93, filterY.firstTheme); // Coast
  await clickDialog(-119, filterY.secondTheme); // Countryside
  await clickDialog(65, filterY.completion); // Never completed
  await clickDialog(125, filterY.action);
  await waitForFilterCount(page, 3);
  const topOfResults = await canvas.screenshot();
  await scrollPickerTo(page, 200);
  assert.ok(!topOfResults.equals(await canvas.screenshot()), 'Three results should scroll across two rows');
  await pickFirst();
  await waitForText('Resume');
  await page.evaluate(() => { window.paintedText = []; });
  await clickDialog(100, resumeActionY); // Resume the unfinished first attempt.
  await waitForText('7 of 8 placed');
  const layout = await playLayout(page);
  const piece = layout.tray[0];
  const target = cellCenter(layout, 0, 0);
  await drag(piece.x, piece.y, target.x, target.y);
  await waitForText('8 of 8 placed');
  assert.equal((await readSave(page)).history.Windmill.length, 1);
  await uiControl(page, { name: 'All puzzles', primary: true });
  await page.evaluate(() => { window.paintedText = []; });
  await pressHeader(page, 'All puzzles');
  await waitForFilterCount(page, 3);
  const shortenedResults = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, shortenedResults, 120, 405),
    await pixelAt(page, shortenedResults, 20, 405), 'The shorter result list should clamp back to the top');
  await pickFirst();
  await waitForText('Meadow');
  await waitForText('Piece count');
  assert.deepEqual(errors, []);
});

scenario('the picker preserves an active filter and its scroll offset until reload', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  await pressHeader(page, 'Filters');
  await waitForText('Type');
  await clickDialog(2, filterY.type); // Parallax
  await clickDialog(125, filterY.action);
  await waitForFilterCount(page, 1);
  await scrollPickerTo(page, 1000);
  const scrolled = await canvas.screenshot();
  await page.mouse.click(340, 340);
  await playSelection();
  await waitForText('0 of 40 placed');
  await page.evaluate(() => { window.paintedText = []; });
  await pressHeader(page, 'All puzzles');
  await waitForFilterCount(page, 1);
  let restored;
  for (const deadline = Date.now() + 4000; Date.now() < deadline;) {
    restored = await canvas.screenshot();
    if (scrolled.equals(restored)) break;
  }
  assert.ok(scrolled.equals(restored), 'The filtered list should return at the same offset');
  await page.reload();
  await waitForText('Windmill');
  await page.mouse.click(340, 180);
  await waitForText('Piece count');
  await waitForText('Windmill');
  assert.deepEqual(errors, []);
});

scenario('touch can scroll the filter dialog and apply choices on a short screen', async (t) => {
  const { page, canvas, waitForText, errors } = await openPuzzle(t, {
    viewport: { width: 640, height: 375 }, hasTouch: true, isMobile: true,
  });
  const { moveFinger } = await touchController(page);
  const firstPreview = await pixelAt(page, await canvas.screenshot(), 120, 165);
  await pressHeader(page, 'Filters', true);
  await waitForText('Theme');
  await page.touchscreen.tap(413, 135); // Coast
  await moveFinger(311, 247, 311, 90);
  await moveFinger(311, 247, 311, 90);
  await moveFinger(311, 247, 311, 90);
  await page.touchscreen.tap(385, 247); // Animated, after scrolling the dialog body.
  await page.touchscreen.tap(445, 317);
  await waitForFilterCount(page, 2);
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 120, 165), firstPreview);
  assert.deepEqual(errors, []);
});

scenario('touch can reach lower Settings and setup options on a short screen', async (t) => {
  const { page, waitForText, errors } = await openCompactPuzzle(t, {
    viewport: { width: 640, height: 375 }, hasTouch: true, isMobile: true,
  });
  const { moveFinger } = await touchController(page);
  const revealOption = async (selector, footer) => {
    let option = await uiControl(page, selector);
    assert.ok(option.y > option.clip.bottom, 'The lower option should start outside the scrollable body');
    const action = await uiControl(page, footer);
    const { x, top, bottom } = option.clip;
    for (let swipe = 0; swipe < 8 && option.y > option.clip.bottom; swipe += 1) {
      await moveFinger(x, bottom - 10, x, top + 10);
      option = await uiControl(page, selector);
    }
    assert.ok(option.y >= option.clip.top && option.y <= option.clip.bottom, 'Swiping should bring the option into view');
    assert.equal((await uiControl(page, footer)).y, action.y, 'The footer should stay in place while the body scrolls');
    await page.touchscreen.tap(option.x, option.y);
  };

  await pressHeader(page, 'Settings', true);
  await revealOption({ sceneKey: 'Settings', text: 'Yes' }, { sceneKey: 'Settings', text: 'Done', action: true });
  assert.equal((await readSave(page)).settings.allowLoosePiecesOnBoard, true);
  await pressSetting(page, 'Done', true);
  await waitForDialogClosed(page, 'Settings');

  await page.touchscreen.tap(320, 180);
  await revealOption({ name: 'no-guide' }, { text: 'Play', action: true });
  await pressAction(page, 'Play', true);
  await waitForText('0 of 8 placed');
  assert.equal((await readSave(page)).recentOptions.challengeMode, 'no-guide');
  assert.deepEqual(errors, []);
});

scenario('touch artist name taps open credits but swipes and cancellation do not', async (t) => {
  const { page, canvas, waitForText, errors } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const { dispatch, moveFinger } = await touchController(page);
  const credits = await page.evaluate(() => {
    const panel = window.puzzlePickerScene.children.list.find(({ type }) => type === 'rexScrollablePanel');
    const [card] = panel.getElement('panel.cards.items');
    const button = card.getChildren().find(({ name }) => name === 'picker-credits');
    return { text: button.text, point: [button.x - button.width / 2, button.y] };
  });
  assert.equal(credits.text, 'Me');
  await page.touchscreen.tap(...credits.point);
  await waitForText('Artwork credits');
  await waitForText('Me');
  const paintedCredits = await page.evaluate(() => window.paintedText.join(' '));
  assert.ok(paintedCredits.includes('Place holder art from the prototype. Left it in for fun.'));
  assert.ok(!paintedCredits.includes('https://example.com'));
  await pressAction(page, 'Close', true);
  await waitForDialogClosed(page, 'SelectPuzzle');
  await page.evaluate(() => { window.paintedText = []; });

  const initial = await canvas.screenshot();
  await dispatch('touchStart', credits.point);
  await dispatch('touchCancel');
  await moveFinger(...credits.point, credits.point[0], 310);
  assert.ok(!initial.equals(await canvas.screenshot()), 'A swipe starting on Credits should scroll');
  const paintedText = await page.evaluate(() => window.paintedText);
  assert.ok(!paintedText.includes('Artwork credits'));
  assert.ok(!paintedText.includes('Piece count'));
  assert.deepEqual(errors, []);
});

scenario('compact picker ellipsis opens details with the preview and inline credits', async (t) => {
  const { page, canvas, waitForText, errors } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const firstCard = () => page.evaluate(() => {
    const scene = window.puzzlePickerScene;
    const panel = scene.children.list.find(({ type }) => type === 'rexScrollablePanel');
    const [card] = panel.getElement('panel.cards.items');
    const children = card.getChildren();
    const more = children.find(({ name }) => name === 'picker-more');
    return {
      title: children.find(({ type, visible }) => type === 'Text' && visible)?.text,
      text: children.filter(({ type, visible }) => visible && (type === 'Text' || type === 'rexLabel'))
        .map((child) => child.text),
      sameRow: more.y === children.find(({ type }) => type === 'Text').y,
      rightInset: card.x + card.width - more.x,
      more: [more.x - more.width / 2, more.y],
    };
  });
  const compact = await page.evaluate(() => {
    const { x, y } = window.puzzlePickerScene.children.getByName('preview-size-Compact');
    return [x, y];
  });
  await page.mouse.click(...compact);
  const card = await firstCard();
  assert.equal(card.title, 'Windmill');
  assert.deepEqual(card.text, ['Windmill', '...']);
  assert.equal(card.sameRow, true);
  assert.equal(card.rightInset, 12);

  await page.mouse.click(...card.more);
  await waitForText('Artwork credits');
  await waitForText('Me');
  await waitForText('Close');
  const details = await page.evaluate(() => {
    const scene = window.puzzlePickerScene;
    const dialog = scene.children.list.find(({ type }) => type === 'rexDialog');
    const [panel] = scene.children.list.filter(({ type }) => type === 'rexScrollablePanel');
    const [card] = panel.getElement('panel.cards.items');
    const preview = card.getChildren().find(({ type }) => type === 'RenderTexture');
    const body = dialog.getElement('content.panel');
    const image = dialog.getElement('title');
    const [title, metadata, ...credits] = body.getChildren();
    const artworkBounds = image.getBounds();
    const borderBounds = dialog.getElement('background').getBounds();
    return {
      sameArtwork: image.texture === preview.texture,
      artworkAboveTitle: artworkBounds.bottom <= title.getBounds().top,
      artworkInsets: [artworkBounds.left - borderBounds.left, borderBounds.right - artworkBounds.right,
        artworkBounds.top - borderBounds.top],
      titleInset: title.getBounds().left - borderBounds.left,
      metadata: metadata.text,
      credits: credits.map(({ text }) => text),
      actions: dialog.getElement('actions').map(({ text }) => text),
    };
  });
  assert.equal(details.sameArtwork, true);
  assert.equal(details.artworkAboveTitle, true);
  assert.ok(details.artworkInsets.every((inset) => Math.abs(inset) < 1), `Artwork insets: ${details.artworkInsets}`);
  assert.equal(details.titleInset, 20);
  assert.match(details.metadata, / · Animated$/);
  assert.deepEqual(details.credits, ['Artwork credits', 'Me', 'Place holder art from the prototype. Left it in for fun.']);
  assert.deepEqual(details.actions, ['Close']);
  const waitForDetails = (open) => page.waitForFunction((open) => {
    const dialog = window.puzzlePickerScene.children.list.find(({ type }) => type === 'rexDialog');
    return open ? Boolean(dialog?.getElement('title')?.texture) : !dialog;
  }, open, { timeout: 4000 });
  await page.keyboard.press('Escape');
  await waitForDetails(false);

  await page.touchscreen.tap(...card.more);
  await waitForDetails(true);
  await pressAction(page, 'Close', true);
  await waitForDetails(false);

  await page.touchscreen.tap(card.more[0], card.more[1] - 65);
  await waitForText('Piece count');
  await page.keyboard.press('Escape');
  await waitForDetails(false);

  const { dispatch, moveFinger } = await touchController(page);
  const initial = await canvas.screenshot();
  await dispatch('touchStart', card.more);
  await dispatch('touchCancel');
  await moveFinger(...card.more, card.more[0], card.more[1] - 80);
  assert.ok(!initial.equals(await canvas.screenshot()), 'A swipe starting on More should scroll');
  assert.equal(await page.evaluate(() => window.puzzlePickerScene.children.list.some(({ type }) => type === 'rexDialog')), false);
  assert.deepEqual(errors, []);
});

scenario('compact picker details puts saved progress in the Close row', async (t) => {
  const { page, errors } = await openPuzzle(t, { viewport: { width: 375, height: 640 }, hasTouch: true },
    currentSizesPuzzlePath, async (page) => {
      await page.addInitScript(({ version, size }) => localStorage.setItem('live-jigsaw.save', JSON.stringify({
        version,
        settings: { pickerPreviewSize: 'Compact' },
        progress: { Windmill: {
          setup: { size, seed: 42, connectorStyle: 'classic', animationSpeed: 'Normal', challengeMode: 'none', pieceRotation: false },
          placedPieceIds: ['piece-0-0'], trayOrientations: {}, parkedGroups: [],
        } },
      })), { version: saveVersion, size: compactSize });
    });
  const more = await page.evaluate(() => {
    const panel = window.puzzlePickerScene.children.list.find(({ type }) => type === 'rexScrollablePanel');
    const [card] = panel.getElement('panel.cards.items');
    const button = card.getChildren().find(({ name }) => name === 'picker-more');
    return [button.x - button.width / 2, button.y];
  });
  await page.touchscreen.tap(...more);
  await page.waitForFunction(() => window.puzzlePickerScene.children.list.some(({ type }) => type === 'rexDialog'));
  const footer = await page.evaluate(() => {
    const dialog = window.puzzlePickerScene.children.list.find(({ type }) => type === 'rexDialog');
    const progress = dialog.getElement('actionsSizer.footerLabel');
    const [close] = dialog.getElement('actions');
    const body = dialog.getElement('content');
    return {
      text: progress?.text,
      inBody: body.getElement('panel').getChildren().some(({ text }) => text === '1 of 8 placed'),
      leftAligned: progress?.getBounds().left === body.getBounds().left,
      rowOffset: progress && progress.getBounds().centerY - close.getBounds().centerY,
    };
  });
  assert.equal(footer.text, '1 of 8 placed');
  assert.equal(footer.inBody, false);
  assert.equal(footer.leftAligned, true);
  assert.ok(Math.abs(footer.rowOffset) < 1, `Progress and Close should share a row (offset: ${footer.rowOffset})`);
  await pressAction(page, 'Close', true);
  await page.waitForFunction(() => !window.puzzlePickerScene.children.list.some(({ type }) => type === 'rexDialog'));
  assert.deepEqual(errors, []);
});

scenario('the picker scrolls past two cards and clips previews', async (t) => {
  await build({
    base: '/picker-fixture/',
    plugins: [{
      name: 'expose-picker-fixture-scene',
      transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/ui/SelectPuzzleScene.ts')) return;
        return `${code}\nconst createPicker = SelectPuzzleScene.prototype.create;\n`
          + `SelectPuzzleScene.prototype.create = function () { createPicker.call(this); window.puzzlePickerScene = this; };`;
      },
    }],
    build: {
      outDir: 'dist/picker-fixture',
      rollupOptions: { input: 'tests/fixtures/puzzle-picker.html' },
    },
  });
  const path = '/picker-fixture/tests/fixtures/puzzle-picker.html';
  const previewColor = [255, 0, 255, 255];
  await t.test('mouse opens partial credits without opening puzzle options', async (t) => {
    const { page, waitForText, errors } = await openPuzzle(t, { viewport: { width: 1320, height: 540 } }, path);
    await page.mouse.click(1166, 412);
    await waitForText('Artwork credits');
    await waitForText('https://example.com/lighthouse');
    const paintedText = await page.evaluate(() => window.paintedText);
    assert.ok(!paintedText.includes('Artist credit pending'));
    assert.ok(!paintedText.includes('Placeholder for the artwork credits.'));
    assert.ok(!paintedText.includes('Piece count'));
    await page.keyboard.press('Escape');
    await scrollPickerTo(page, 1000);
    await page.mouse.click(590, 475); // The uncredited card has no separate footer action.
    await waitForText('Piece count');
    assert.deepEqual(errors, []);
  });
  await t.test('mouse wheel scrolls to a selectable third card', async (t) => {
    const { page, canvas, waitForText, errors, playSelection } = await openPuzzle(t, { viewport: { width: 1320, height: 540 } }, path);
    const initial = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, initial, 120, 175), [192, 221, 219, 255]);
    assert.notDeepEqual(await pixelAt(page, initial, 800, 175), [38, 58, 54, 255], 'The second card should sit beside the first');
    const settings = await uiControl(page, { name: 'Settings' });
    assert.equal(settings.width, settings.height, 'The header control should be square');
    const sampleX = settings.x - settings.width / 3;
    await page.mouse.move(sampleX, settings.y);
    const hoveredButton = await pixelAt(page, await canvas.screenshot(), sampleX, settings.y);
    await page.mouse.down();
    assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), sampleX, settings.y), hoveredButton, 'A held mouse button should look pressed');
    await page.mouse.move(sampleX, settings.y + settings.height);
    await page.mouse.up();
    await page.mouse.move(sampleX, settings.y);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), sampleX, settings.y), hoveredButton, 'Moving off the button should clear the press');
    await page.mouse.move(340, 180);
    await page.mouse.down();
    const previewBeforePress = await pixelAt(page, initial, 86, 116);
    assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 86, 116), previewBeforePress, 'The card should respond to a mouse press');
    await page.mouse.move(360, 180);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 86, 116), previewBeforePress, 'Crossing the drag threshold should clear the press');
    await page.mouse.up();
    const assertColumnSpacing = (screenshot) => {
      const { width, data } = PNG.sync.read(screenshot);
      const rowStart = width * 116 * 4;
      const background = data.subarray(rowStart, rowStart + 4);
      const listWidth = width - 24;
      const edges = [];
      let insideCard = false;
      for (let x = 0; x < listWidth; x += 1) {
        const offset = rowStart + x * 4;
        const onCard = !data.subarray(offset, offset + 4).equals(background);
        if (onCard !== insideCard) edges.push(x);
        insideCard = onCard;
      }
      assert.equal(edges.length, 4);
      const [firstLeft, firstRight, secondLeft, secondRight] = edges;
      assert.equal(secondLeft - firstRight, 16, 'The inter-column gap should match the row gap');
      assert.ok(Math.abs(firstLeft - (listWidth - secondRight)) <= 2,
        'Extra space should go to the outside margins');
    };
    assertColumnSpacing(initial);
    await page.setViewportSize({ width: 1470, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 1470);
    assertColumnSpacing(await canvas.screenshot());
    await page.setViewportSize({ width: 768, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 768);
    const narrow = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, narrow, 140, 175), [192, 221, 219, 255]);
    assert.deepEqual(await pixelAt(page, narrow, 700, 175), [38, 58, 54, 255], 'The same picker should reflow to one column');
    await page.setViewportSize({ width: 1320, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 1320);
    await page.mouse.move(340, 300);
    await page.mouse.wheel(0, 1000);
    const scrolled = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, scrolled, 120, 175), previewColor);
    for (const [x, y] of [[79, 175], [642, 175], [120, 136], [120, 453], [81, 138]]) {
      assert.notDeepEqual(await pixelAt(page, scrolled, x, y), previewColor, `Artwork should stay inside all four preview edges (${x}, ${y})`);
    }
    for (const x of [81, 638]) {
      assert.deepEqual(await pixelAt(page, scrolled, x, 175), previewColor, 'The preview should fill the card width');
    }
    const { width, data } = PNG.sync.read(scrolled);
    const textBands = [];
    let onText = false;
    for (let y = 450; y < 510; y += 1) {
      const row = y * width * 4;
      const background = data.subarray(row + 360 * 4, row + 361 * 4);
      let hasInk = false;
      for (let x = 96; x < 350 && !hasInk; x += 1) {
        hasInk = !data.subarray(row + x * 4, row + (x + 1) * 4).equals(background);
      }
      if (hasInk !== onText) textBands.push(y);
      onText = hasInk;
    }
    assert.equal(textBands.length, 4, 'The preview title and tags should form two distinct text lines');
    assert.ok(textBands[2] - textBands[1] >= 4, 'The title descenders should clear the tag text');
    await page.mouse.click(340, 175);
    await waitForText('Connector style');
    await waitForText('None'); // The default challenge mode, not a connector caption.
    const paintedText = await page.evaluate(() => window.paintedText);
    assert.ok(paintedText.includes('40'), 'The size tile should show only its piece count');
    assert.ok(!paintedText.includes('Classic · 40'));
    assert.ok(!paintedText.includes('8'), 'The retired size should not be offered');
    for (const label of ['Classic', 'Rounded', 'Angular']) {
      assert.ok(!paintedText.includes(label), `The ${label} connector option should not draw a caption`);
    }
    for (const label of ['Square', 'Vertical Long', 'Horizontal Long', 'Vertical Short', 'Horizontal Short']) {
      assert.ok(!paintedText.includes(label), `The ${label} piece shape should not draw a caption`);
    }
    const classic = await uiControl(page, { name: 'classic' });
    const rounded = await uiControl(page, { name: 'rounded' });
    const count = await uiControl(page, { text: '40' });
    const shape = await uiControl(page, { name: 'vertical-short' });
    const connectorless = await uiControl(page, { name: 'none', text: '' });
    const tilePixel = (screenshot, tile, dx = 0, dy = 0) => pixelAt(page, screenshot, tile.x + dx, tile.y + dy);
    const selectedFill = [75, 108, 94, 255];
    const beforeSelection = await canvas.screenshot();
    assert.deepEqual(await tilePixel(beforeSelection, classic, -26, 20), selectedFill);
    const iconFill = [101, 135, 122, 255];
    assert.deepEqual(await tilePixel(beforeSelection, count, 0, -16), selectedFill, 'The count tile should have no illustration');
    assert.deepEqual(await tilePixel(beforeSelection, shape), iconFill, 'The first shape illustration should draw above its tile');
    assert.deepEqual(await tilePixel(beforeSelection, connectorless, 0, 5), iconFill, 'The connector illustration should draw above its tile');
    await clickControl(page, { name: 'rounded' });
    const afterSelection = await canvas.screenshot();
    assert.notDeepEqual(await tilePixel(afterSelection, classic, -26, 20), selectedFill);
    assert.deepEqual(await tilePixel(afterSelection, rounded, -26, 20), selectedFill);
    await page.setViewportSize({ width: 375, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 375);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const corner = await pixelAt(page, await canvas.screenshot(), 2, 538);
    assert.ok(corner[0] < 38, `The modal backdrop should still reach the corner after resizing: ${corner}`);
    await page.setViewportSize({ width: 1320, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 1320);
    await page.mouse.move(340, 175);
    await page.mouse.wheel(0, -1000);
    await pressAction(page, 'Cancel');
    await waitForDialogClosed(page, 'SelectPuzzle');
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 120, 175), previewColor, 'Cancel should preserve the picker scroll position');
    await page.mouse.click(340, 175);
    await playSelection();
    await waitForText('0 of 40 placed');
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Normal');
    await page.evaluate(() => { window.paintedText = []; });
    await pressHeader(page, 'All puzzles');
    await waitForPicker(page);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 120, 175), previewColor, 'Returning from play should restore the picker offset');
    await page.mouse.click(340, 175);
    await playSelection({ animationSpeed: 'Slow' });
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Slow');

    await page.evaluate(() => { window.paintedText = []; });
    await pressHeader(page, 'All puzzles');
    await waitForPicker(page);
    await scrollPickerTo(page, 0);
    await page.mouse.click(340, 175);
    await playSelection({ size: 72, connectorStyle: 'None', animationSpeed: 'Fast' });
    await waitForText('0 of 72 placed');
    await page.reload();
    await waitForText('Windmill');
    await page.mouse.click(1003, 175);
    await playSelection();
    await waitForText('0 of 72 placed');
    assert.deepEqual((await readSave(page)).recentOptions, {
      pieceCount: 72, pieceShape: 'vertical-short', connectorStyle: 'none', animationSpeed: 'Fast', challengeMode: 'none', pieceRotation: false,
    });

    await page.evaluate(() => { window.paintedText = []; });
    await pressHeader(page, 'All puzzles');
    await waitForPicker(page);
    await page.mouse.move(340, 300);
    await page.mouse.wheel(0, 1000);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 120, 175), previewColor);
    await page.mouse.click(340, 175);
    await playSelection();
    await waitForText('0 of 72 placed');
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Fast');
    assert.deepEqual((await readSave(page)).recentOptions, {
      pieceCount: 72, pieceShape: 'vertical-short', connectorStyle: 'none', animationSpeed: 'Fast', challengeMode: 'none', pieceRotation: false,
    });
    assert.deepEqual(errors, []);
  });

  await t.test('touch can swipe from a preview and tap a different puzzle', async (t) => {
    const { page, canvas, waitForText, errors, playSelection } = await openPuzzle(t, {
      viewport: { width: 768, height: 780 },
      hasTouch: true,
      isMobile: true,
    }, path);
    const touch = await page.context().newCDPSession(page);
    const swipeUp = async (x, startY, endY, onMove = async () => {}) => {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
      await onMove(0);
      for (let step = 1; step <= 10; step += 1) {
        const y = startY + (endY - startY) * step / 10;
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        await onMove(step);
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };

    const initial = await canvas.screenshot();
    await swipeUp(400, 265, 43, async (step) => {
      if (step === 0) {
        assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 108, 160), [192, 221, 219, 255], 'The card should respond to a touch press');
      }
      if (step === 1) {
        assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 108, 160), [192, 221, 219, 255], 'The card should release while the finger is scrolling');
      }
    });
    assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 140, 244), await pixelAt(page, initial, 140, 244));
    assert.equal(await page.evaluate(() => window.paintedText.includes('Connector style')), false, 'A swipe should keep the options closed');
    await swipeUp(170, 700, 180);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 140, 410), previewColor, 'A swipe should reveal the third card');
    await page.touchscreen.tap(400, 410);
    await playSelection({ connectorStyle: 'None', animationSpeed: 'Fast' });
    await waitForText('0 of 40 placed');
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Fast');
    await page.evaluate(() => { window.paintedText = []; });
    await pressHeader(page, 'All puzzles', true);
    await waitForPicker(page);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 140, 410), previewColor,
      'Returning by touch should restore the swiped picker offset');
    assert.deepEqual(errors, []);
  });
});

scenario('tablet touch scrolls, resizes, zooms, cancels, and places pieces', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openCompactPuzzle(t, {
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
  });
  const { dispatch, moveFinger } = await touchController(page);

  await page.touchscreen.tap(522, 180);
  await playSelection();
  await waitForText('0 of 8 placed');
  const startingPiece = await pixelAt(page, await canvas.screenshot(), 85, 140);
  await moveFinger(85, 254, 85, 140);
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 85, 140), startingPiece, 'A swipe starting on a piece should scroll');
  await moveFinger(85, 140, 85, 254);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 85, 140), startingPiece);
  await dragDivider(page, moveFinger, { x: 450 });
  const wide = await playLayout(page);
  assert.ok(wide.tray[1].x > wide.tray[0].x && wide.tray[1].y === wide.tray[0].y, 'The touch divider should reflow the tray');

  const panelBackground = [32, 46, 42, 255];
  const { x: sampleX, y: sampleY } = wide.boardPoint(438, -8);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), sampleX, sampleY), panelBackground);
  await dispatch('touchStart', [530, 372]);
  await dispatch('touchStart', [530, 372], [650, 372]);
  await dispatch('touchMove', [500, 372], [680, 372]);
  await dispatch('touchEnd');
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), sampleX, sampleY), panelBackground, 'A pinch should enlarge the board artwork');

  const { x, y } = wide.tray.find(({ id }) => id === 'piece-0-0');
  const target = cellCenter(await playLayout(page), 0, 0);
  await moveFinger(x, y, target.x, target.y, 'touchCancel');
  assert.equal(await page.evaluate(() => window.paintedText.includes('1 of 8 placed')), false, 'A cancelled touch should not place a piece');
  const sky = [192, 221, 219, 255];
  await dispatch('touchStart', [x, y]);
  await dispatch('touchMove', [x - 30, y]);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), x, y), sky,
    'A leftward move should leave the piece in the tray');
  await dispatch('touchEnd');
  await dispatch('touchStart', [x, y]);
  await dispatch('touchMove', [x, y + 12]);
  await dispatch('touchMove', [x + 14, y + 35]);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), x + 60, y + 32), sky,
    'A rightward drag near 70° should lift the piece after a small vertical start');
  await dispatch('touchMove', [target.x, target.y]);
  await dispatch('touchEnd');
  await waitForText('1 of 8 placed');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), target.x, target.y), sky, 'A touch drop should snap at the zoomed target');
  await moveFinger(700, 500, 850, 500);
  const panned = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, panned, target.x, target.y), panelBackground, 'One finger should pan the zoomed board');
  assert.deepEqual(await pixelAt(page, panned, target.x + 150, target.y), sky, 'Placed pieces should follow the pan');
  const fit = (await playLayout(page)).fitButton;
  await page.touchscreen.tap(fit.x + fit.width - 4, fit.y + fit.height / 2);
  const fitted = await canvas.screenshot();
  const fittedTarget = cellCenter(wide, 0, 0);
  assert.deepEqual(await pixelAt(page, fitted, fittedTarget.x, fittedTarget.y), sky, 'A tap near the edge of Fit board should recenter the placed piece');
  assert.deepEqual(await pixelAt(page, fitted, sampleX, sampleY), panelBackground, 'Fit board should restore the full artwork after a pinch');

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => document.querySelector('canvas').height === 1024);
  await page.evaluate(() => { window.paintedText = []; });
  await pressHeader(page, 'All puzzles', true);
  await waitForPicker(page);
  await page.touchscreen.tap(395, 180);
  await waitForText('Resume');
  await page.evaluate(() => { window.paintedText = []; });
  await clickDialog(100, resumeActionY);
  await waitForText('1 of 8 placed');
  await page.evaluate(() => { window.paintedText = []; });
  await pressHeader(page, 'All puzzles', true);
  await waitForPicker(page);
  await page.touchscreen.tap(395, 180);
  await waitForText('Resume');
  await clickDialog(-6, resumeActionY);
  await playSelection({ size: 128, connectorStyle: 'Rounded' });
  await waitForText('0 of 128 placed');
  const thumbnail = (await playLayout(page)).tray[0];
  const tray128 = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, tray128, thumbnail.x, thumbnail.y), [52, 66, 62, 255], 'The smallest pieces should render in the bottom tray');
  assert.deepEqual(errors, []);
});

scenario('tray settings move the live tray and rotate touch gestures with it', async (t) => {
  const portrait = { width: 640, height: 860 };
  const landscape = { width: 1024, height: 768 };
  const { page, canvas, waitForText, errors, clickDialog, clickSetting, playSelection } = await openCompactPuzzle(t, {
    viewport: portrait, hasTouch: true, isMobile: true,
  });
  const { dispatch, moveFinger } = await touchController(page);
  const trayColor = [52, 66, 62, 255];
  const boardColor = [32, 46, 42, 255];
  const selectedColor = [75, 108, 94, 255];
  const layout = {
    Left: { scroll: [0, -100], lift: [85, 0] },
    Right: { scroll: [0, -100], lift: [-85, 0] },
    Bottom: { scroll: [-46, 0], lift: [0, -90] },
    Top: { scroll: [-46, 0], lift: [0, 95] },
  };
  const sample = async (...point) => pixelAt(page, await canvas.screenshot(), ...point);
  const assertSide = async (side) => {
    const { width, height } = page.viewportSize();
    const { board, tray } = await playLayout(page);
    const top = side === 'Top' ? tray[0].y : board.y + 4;
    const points = {
      Left: [[1, top], [width - 2, top]],
      Right: [[width - 2, top], [1, top]],
      Bottom: [[1, height - 2], [1, top]],
      Top: [[1, top], [1, height - 2]],
    };
    const [trayPoint, boardPoint] = points[side];
    const frame = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, frame, ...trayPoint), trayColor, `Expected tray on the ${side}`);
    assert.deepEqual(await pixelAt(page, frame, ...boardPoint), boardColor, `Expected board opposite the ${side} tray`);
  };
  const tapSettings = paceRepeatClicks(() => pressHeader(page, 'Settings', true));
  const openTraySettings = async () => {
    await page.evaluate(() => { window.paintedText = []; });
    await tapSettings();
    await waitForText('Puzzle tray');
  };
  const closeSettings = () => clickSetting('Done');
  const selectSide = async (side) => {
    await openTraySettings();
    await clickSetting(side);
    assert.equal((await readSave(page)).settings.trayPosition, side);
    await closeSettings();
  };
  const resize = async (viewport) => {
    await page.setViewportSize(viewport);
    await page.waitForFunction(({ width, height }) => {
      const canvas = document.querySelector('canvas');
      return canvas.width === width && canvas.height === height;
    }, viewport);
  };

  await page.touchscreen.tap(350, 180);
  await playSelection({ connectorStyle: 'None' });
  await waitForText('0 of 8 placed');
  await assertSide('Bottom');
  await openTraySettings();
  const settingFill = async (text) => {
    const { x, y, width, height } = await uiControl(page, { sceneKey: 'Settings', text });
    return sample(x + width / 4, y + height / 4);
  };
  assert.deepEqual(await settingFill('Auto'), selectedColor, 'Auto should be selected without a saved setting');
  await closeSettings();

  for (const side of ['Left', 'Right', 'Top', 'Bottom']) {
    // Shorten the side trays so the compact set overflows along the scroll axis.
    if (side === 'Left') await resize({ ...portrait, height: 600 });
    await selectSide(side);
    if (side === 'Top') await resize(portrait);
    await assertSide(side);
    const { scroll: [scrollX, scrollY], lift: [liftX, liftY] } = layout[side];
    const first = async () => (await playLayout(page)).tray[0];
    const { x, y } = await first();
    const swipeStart = (await playLayout(page)).tray[2];
    assert.notDeepEqual(await sample(x, y), trayColor, `Expected a piece at the start of the ${side} tray`);
    await moveFinger(swipeStart.x, swipeStart.y, swipeStart.x + scrollX, swipeStart.y + scrollY);
    const scrolled = await first();
    assert.ok(scrollX ? scrolled.x < x : scrolled.y < y,
      `A swipe along the ${side} tray should scroll from a piece (${x}, ${y}) to (${scrolled.x}, ${scrolled.y})`);
    await moveFinger(swipeStart.x + scrollX, swipeStart.y + scrollY, swipeStart.x, swipeStart.y);
    assert.deepEqual(await first(), { ...scrolled, x, y });
    await dispatch('touchStart', [x, y]);
    await dispatch('touchMove', [x + liftX, y + liftY]);
    assert.deepEqual(await sample(x, y), trayColor, `Pulling toward the board should lift from the ${side} tray`);
    await dispatch('touchCancel');
    assert.notDeepEqual(await sample(x, y), trayColor, 'Cancellation should return the piece to its slot');
  }

  const { id, x: trayX, y: trayY } = (await playLayout(page)).tray[0];
  await page.mouse.move(trayX, trayY);
  for (const [dx, dy] of [[62, 0], [0, 62]]) {
    await page.mouse.wheel(dx, dy);
    assert.ok((await playLayout(page)).tray[0].x < trayX, 'Wheel input should scroll a horizontal tray');
    await page.mouse.wheel(-dx, -dy);
    assert.equal((await playLayout(page)).tray[0].x, trayX);
  }

  await dispatch('touchStart', [280, 392]);
  await dispatch('touchStart', [280, 392], [400, 392]);
  await dispatch('touchMove', [265, 392], [415, 392]);
  await dispatch('touchEnd');
  const zoomed = await playLayout(page);
  assert.ok(zoomed.board.zoom > 1, 'Pinch should zoom the board');
  const { x: dropX, y: dropY } = pieceTarget(zoomed, id);
  const placedAt = [dropX, dropY];
  await dispatch('touchStart', [trayX, trayY]);
  await dispatch('touchMove', [trayX, trayY - 24]);
  await dispatch('touchMove', placedAt);
  await dispatch('touchEnd');
  await waitForText('1 of 8 placed');
  const placedColor = await sample(...placedAt);
  const savedProgress = (await readSave(page)).progress.Windmill;
  assert.deepEqual(savedProgress.placedPieceIds, [id], 'A piece from the bottom tray should snap after pinch zoom');

  await selectSide('Auto');
  await dispatch('touchStart', [trayX, trayY]);
  await dispatch('touchMove', [trayX, trayY - 90]);
  assert.ok((await sample(trayX, trayY))[0] < trayColor[0], 'The lifted piece should cast a shadow before rotating');
  await resize(landscape);
  await dispatch('touchEnd');
  await assertSide('Left');
  assert.notDeepEqual(await sample(75, 136), trayColor, 'Rotation should return the lifted piece to the tray');
  await resize(portrait);
  await assertSide('Bottom');
  assert.deepEqual(await sample(...placedAt), placedColor, 'Rotating back should keep the placed piece and zoom');
  assert.deepEqual((await readSave(page)).progress.Windmill, savedProgress);

  await selectSide('Left');
  const narrowTray = (await playLayout(page)).traySize.width;
  await dragDivider(page, moveFinger, { x: 245 });
  const wideTray = (await playLayout(page)).traySize.width;
  assert.ok(wideTray > narrowTray, 'Dragging the side divider should widen the tray');
  const sideSizes = (await readSave(page)).settings.trayFractions;
  assert.ok(sideSizes.vertical > 0);
  assert.equal(sideSizes.horizontal, 0);
  await selectSide('Top');
  const shortTray = (await playLayout(page)).traySize.height;
  await dragDivider(page, moveFinger, { y: 340 });
  const tallTray = (await playLayout(page)).traySize.height;
  assert.ok(tallTray > shortTray, 'Dragging the top divider should make the tray taller');
  const savedSizes = (await readSave(page)).settings.trayFractions;
  assert.equal(savedSizes.vertical, sideSizes.vertical);
  assert.ok(savedSizes.horizontal > 0);
  await selectSide('Bottom');
  assert.ok(Math.abs((await playLayout(page)).traySize.height - tallTray) <= 1, 'Top and Bottom should share the adjusted tray size');
  await selectSide('Right');
  assert.ok(Math.abs((await playLayout(page)).traySize.width - wideTray) <= 1, 'Right should restore the adjusted side tray size');
  await resize(landscape);
  await assertSide('Right');
  const landscapeTrayWidth = (await playLayout(page)).traySize.width;

  await page.reload();
  await waitForText('Windmill');
  await openTraySettings();
  assert.deepEqual(await settingFill('Right'), selectedColor, 'Right should remain selected after reload');
  await closeSettings();
  await page.touchscreen.tap(522, 180);
  await waitForText('Resume');
  await page.evaluate(() => { window.paintedText = []; });
  await clickDialog(100, resumeActionY);
  await waitForText('1 of 8 placed');
  await assertSide('Right');
  assert.equal((await playLayout(page)).traySize.width, landscapeTrayWidth, 'The saved tray width should return after reopening the puzzle');
  await resize(portrait);
  await selectSide('Bottom');
  assert.ok(Math.abs((await playLayout(page)).traySize.height - tallTray) <= 1, 'The saved tray height should return after reopening the puzzle');
  assert.deepEqual((await readSave(page)).settings.trayFractions, savedSizes);
  assert.deepEqual(errors, []);
});

const concurrency = Number(process.env.LIVE_JIGSAW_BROWSER_CONCURRENCY ?? 4);
const timeout = Number(process.env.LIVE_JIGSAW_BROWSER_TIMEOUT ?? 20_000);
describe('puzzle play', { concurrency }, () => {
  for (const { name, run } of scenarios) test(name, { timeout }, run);
});
