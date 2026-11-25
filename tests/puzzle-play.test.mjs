import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { build, preview } from 'vite';

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

async function openPuzzle(t, options, path = '/') {
  const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
  t.after(() => server.close());
  const { port } = server.httpServer.address();
  const browser = await chromium.launch({
    channel: process.env.LIVE_JIGSAW_BROWSER ?? 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  t.after(() => browser.close());

  const page = await browser.newPage(options);
  await page.addInitScript(() => {
    // Use a repeatable game seed so the placement coordinates refer to known pieces.
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (values) => {
      crypto.getRandomValues = getRandomValues;
      values[0] = 1_011_889;
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
  await page.goto(`http://127.0.0.1:${port}${path}`);
  const canvas = page.locator('#game canvas');
  const waitForText = async (text) => {
    try {
      await page.waitForFunction((value) => window.paintedText.includes(value), text, { timeout: 4000 });
    } catch (error) {
      assert.deepEqual(errors, []);
      throw error;
    }
  };
  await waitForText('Windmill');
  const clickDialog = async (dx, dy) => {
    const { x, y, width, height } = await canvas.boundingBox();
    const tap = options.hasTouch ? page.touchscreen.tap.bind(page.touchscreen) : page.mouse.click.bind(page.mouse);
    await tap(x + width / 2 + dx, y + height / 2 + dy);
  };
  const playSelection = async ({ size, connectorStyle, animationSpeed } = {}) => {
    await waitForText('Animation speed');
    // Phaser hit-tests the camera's render list, which updates on the first dialog frame.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (size) {
      const index = ['Classic · 8', 'Large · 32', 'Dense · 64', 'Expert · 128'].indexOf(size);
      assert.ok(index >= 0);
      await clickDialog(-156 + 104 * index, -107);
    }
    if (connectorStyle) {
      const index = ['Classic', 'Rounded', 'Angular', 'None'].indexOf(connectorStyle);
      assert.ok(index >= 0);
      await clickDialog(-156 + 104 * index, 19);
    }
    if (animationSpeed) {
      const index = ['Slow', 'Normal', 'Fast'].indexOf(animationSpeed);
      assert.ok(index >= 0);
      await clickDialog(-156 + 104 * index, 130);
    }
    await clickDialog(158, 200);
  };
  return { page, canvas, waitForText, errors, clickDialog, playSelection };
}

test('live pieces scroll, reflow, and snap to the pannable board', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openPuzzle(t, { viewport: { width: 1320, height: 780 } });
  const bounds = await canvas.boundingBox();
  assert.equal(bounds.width, 1320);
  assert.equal(bounds.height, 780);
  const move = (x, y, steps) => page.mouse.move(bounds.x + x, bounds.y + y, { steps });
  const click = (x, y) => page.mouse.click(bounds.x + x, bounds.y + y);
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
  assert.ok(header.includes('All puzzles') && header.includes('Windmill'));
  assert.ok(!header.includes('Pieces') && !header.includes('Drag to pan · Scroll to zoom'));
  const initial = await canvas.screenshot();
  const sky = [192, 221, 219, 255];
  const panelBackground = [25, 46, 40, 255];
  assert.deepEqual(await pixelAt(page, initial, 1290, 100), panelBackground, 'The board should extend into the reclaimed space');
  const guide = await pixelAt(page, initial, 542, 348);
  assert.ok(guide[0] > 25 && guide[0] < sky[0], 'The board should show the artwork at low opacity');
  assert.notDeepEqual(await pixelAt(page, initial, 199, 140), sky, 'The tray should start with one column');
  await move(85, 140);
  await page.mouse.wheel(0, 475);
  const scrolled = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, scrolled, 85, 140), await pixelAt(page, initial, 85, 140));
  await page.mouse.wheel(0, -1000);
  const dividerBackground = [38, 58, 54, 255];
  assert.deepEqual(await pixelAt(page, initial, 163, 320), dividerBackground);
  assert.deepEqual(await pixelAt(page, initial, 170, 320), dividerBackground);
  const centerPixels = await Promise.all([166, 167].map((x) => pixelAt(page, initial, x, 320)));
  assert.equal(centerPixels.filter(([red]) => red > dividerBackground[0]).length, 1, 'The divider should draw a single centered line');
  const gripColor = await pixelAt(page, initial, 167, 420);
  assert.notDeepEqual(gripColor, await pixelAt(page, initial, 167, 320), 'The divider should have a visible center grip');
  await drag(167, 420, 552, 420);
  const widened = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, widened, 552, 420), gripColor, 'The grip should move with the divider');
  assert.deepEqual(await pixelAt(page, widened, 427, 140), sky, 'Widening the tray should reveal another column');
  const boardSeam = await pixelAt(page, widened, 798, 302);
  assert.deepEqual(boardSeam, guide, 'The faint guide should be continuous across piece boundaries');
  await drag(427, 140, 600, 70);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 427, 140), sky, 'An invalid drop should return to the tray');
  await move(427, 140);
  await page.mouse.down();
  await move(735, 348, 8);
  const beforeZoom = await canvas.screenshot();
  await page.mouse.wheel(0, -200);
  const zoomed = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, beforeZoom, 650, 472), panelBackground);
  assert.notDeepEqual(await pixelAt(page, zoomed, 650, 472), panelBackground, 'The wheel should enlarge the board');
  assert.notDeepEqual(await pixelAt(page, beforeZoom, 823, 338), sky);
  assert.deepEqual(await pixelAt(page, zoomed, 823, 338), sky, 'A piece in hand should scale with the board');
  await page.mouse.up();
  await waitForText('1 of 8 placed');
  const placed = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, placed, 735, 348), sky, 'Zooming at the drop target should keep it under the pointer');
  await click(1246, 43);
  await waitForText('Color theme');
  await clickDialog(21, -80);
  await clickDialog(101, 153);
  const slate = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, slate, 1290, 100), [31, 45, 64, 255], 'Settings should restyle the active board');
  assert.deepEqual(await pixelAt(page, slate, 735, 348), sky, 'The placed piece should stay at its zoomed position');
  await page.evaluate(() => { window.paintedText = []; });
  await click(1246, 43);
  await waitForText('Color theme');
  await clickDialog(-95, -80);
  await page.waitForFunction(() => localStorage.getItem('live-jigsaw.theme') === 'Forest');
  await page.keyboard.press('Escape');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const unfiltered = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, unfiltered, 1290, 100), panelBackground);
  const trayPieceColor = await pixelAt(page, unfiltered, 85, 140);
  assert.notDeepEqual(trayPieceColor, [48, 72, 65, 255], 'The sample should be on a tray piece');
  const guidePixel = (screenshot) => pixelAt(page, screenshot, 990, 348);
  const originalGuide = await guidePixel(unfiltered);
  const assertGuideColor = (actual, expected, message) => {
    assert.ok(actual.every((channel, i) => Math.abs(channel - expected[i]) <= 1),
      `${message}. Expected ${expected}, got ${actual}`);
  };
  assertGuideColor(originalGuide, [65, 88, 83, 255], 'The original guide should blend with the board at 24% opacity');

  const selectFilter = async (x, y, name) => {
    await page.evaluate(() => { window.paintedText = []; });
    await click(1246, 43);
    await waitForText('Black and White');
    const before = await guidePixel(await canvas.screenshot());
    await clickDialog(x, y);
    await page.waitForFunction((expected) => localStorage.getItem('live-jigsaw.puzzle-filter') === expected, name);
    assert.notDeepEqual(await guidePixel(await canvas.screenshot()), before, 'The guide should change while Settings is still open');
    await clickDialog(101, 153);
    const screenshot = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, screenshot, 735, 348), sky, 'The placed piece should keep its original color');
    assert.deepEqual(await pixelAt(page, screenshot, 85, 140), trayPieceColor, 'The tray piece should keep its original color');
    return guidePixel(screenshot);
  };
  assertGuideColor(await selectFilter(-65, 19, 'grayscale'), [211, 211, 211, 255], 'Black and White should be fully opaque');
  assertGuideColor(await selectFilter(88, 19, 'sepia'), [255, 255, 199, 255], 'Sepia should be fully opaque');
  assertGuideColor(await selectFilter(-65, 81, 'faded'), [179, 193, 192, 255], 'Faded should be fully opaque');

  await move(735, 348);
  await page.mouse.wheel(0, 200);
  await move(199, 253);
  await page.mouse.down();
  await move(863, 348, 8);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 863, 348), sky, 'The dragged piece should keep its original color');
  await page.mouse.up();
  await waitForText('2 of 8 placed');
  const joined = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, joined, 863, 348), sky, 'A newly placed piece should keep its original color');
  for (const [x, y] of [[798, 337], [802, 339], [811, 342], [815, 348], [809, 357]]) {
    assert.deepEqual(await pixelAt(page, joined, x, y), sky, 'The live guide should not show through joined pieces');
  }
  assert.deepEqual(await selectFilter(88, 81, null), originalGuide, 'Clearing the filter should restore the original guide');

  const assertCornerAtCenter = async (horizontal, vertical) => {
    const screenshot = await canvas.screenshot();
    assert.notDeepEqual(await pixelAt(page, screenshot, 927 + 14 * horizontal, 420 + 14 * vertical), panelBackground);
    assert.deepEqual(await pixelAt(page, screenshot, 927 - 14 * horizontal, 420 - 14 * vertical), panelBackground);
  };
  await drag(610, 180, 1240, 700);
  await assertCornerAtCenter(1, 1);
  await drag(1240, 300, 610, 300);
  await assertCornerAtCenter(-1, 1);
  await drag(1000, 700, 1000, 180);
  await assertCornerAtCenter(-1, -1);
  await drag(610, 300, 1240, 300);
  await assertCornerAtCenter(1, -1);

  await page.setViewportSize({ width: 1500, height: 850 });
  await page.waitForFunction(() => document.querySelector('canvas').height === 850);
  const resized = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, resized, 1450, 800), panelBackground, 'The board panel should fill the resized window');
  await page.setViewportSize({ width: 1320, height: 780 });
  await page.waitForFunction(() => document.querySelector('canvas').height === 780);
  await page.evaluate(() => { window.paintedText = []; });
  await click(99, 43);
  await waitForText('Windmill');
  await click(1160, 180);
  await playSelection({ size: 'Large · 32' });
  await waitForText('0 of 32 placed');
  await drag(167, 320, 552, 320);
  const largeBefore = await canvas.screenshot();
  await drag(900, 350, 800, 270);
  const largeAfter = await canvas.screenshot();
  const tower = await pixelAt(page, largeBefore, 1124, 492);
  assert.notDeepEqual(await pixelAt(page, largeAfter, 1124, 492), tower);
  assert.deepEqual(await pixelAt(page, largeAfter, 1024, 412), tower, 'Large artwork should move with both pan axes');
  await drag(313, 391, 635, 268);
  await waitForText('1 of 32 placed');

  await page.setViewportSize({ width: 900, height: 620 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 900);
  await page.evaluate(() => { window.paintedText = []; });
  await click(99, 43);
  await waitForText('Windmill');
  await click(460, 180);
  await playSelection();
  await waitForText('0 of 8 placed');
  const replay = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, replay, 85, 140), sky);
  assert.notDeepEqual(await pixelAt(page, initial, 85, 140), sky, 'Reopening the same puzzle should shuffle the tray again');
  await page.evaluate(() => { window.paintedText = []; });
  await click(99, 43);
  await waitForText('Windmill');
  await click(340, 180);
  await playSelection({ size: 'Dense · 64' });
  await waitForText('0 of 64 placed');
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 85, 140), [48, 72, 65, 255], 'The dense tray should render its thumbnails');
  assert.deepEqual(errors, []);
});

test('the four new artwork scenes animate on the board', async (t) => {
  const { page, waitForText, errors, playSelection } = await openPuzzle(t, { viewport: { width: 1320, height: 780 } });
  const selections = [
    { title: 'Mountains', x: 340, y: 613, scroll: 320 },
    { title: 'Meadow', x: 1003, y: 613, scroll: 320 },
    { title: 'Desert', x: 340, y: 500, scroll: 720 },
    { title: 'Forest', x: 1003, y: 500, scroll: 720 },
  ];
  const board = { x: 435, y: 275, width: 590, height: 320 };

  for (const { title, x, y, scroll } of selections) {
    await page.mouse.move(340, 300);
    await page.mouse.wheel(0, scroll);
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(x, y);
    await playSelection({ connectorStyle: 'Angular', animationSpeed: 'Fast' });
    await waitForText(title);
    await waitForText('0 of 8 placed');
    const before = await page.screenshot({ clip: board });
    assert.notDeepEqual(await pixelAt(page, before, 302, 165), [25, 46, 40, 255], `${title} should fill the board guide`);
    await page.evaluate(async () => {
      for (let frame = 0; frame < 12; frame += 1) await new Promise(requestAnimationFrame);
    });
    const after = await page.screenshot({ clip: board });
    assert.ok(!before.equals(after), `${title} should animate the captured artwork`);
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(99, 43);
    await waitForText('Windmill');
  }
  assert.deepEqual(errors, []);
});

test('the medieval village is captured during loading and animates after reopening', async (t) => {
  const { page, canvas, waitForText, errors, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  const atlas = /medievalRTS_spritesheet[^/]*\.png(?:\?|$)/;
  const loading = Promise.withResolvers();
  const release = Promise.withResolvers();
  await page.route(atlas, async (route) => {
    loading.resolve();
    await release.promise;
    await route.abort();
  });
  t.after(() => release.resolve());

  const openVillage = async () => {
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.move(340, 300);
    await page.mouse.wheel(0, 2200);
    await page.mouse.click(340, 600);
    await playSelection({ animationSpeed: 'Fast' });
    await waitForText('Medieval Village');
    await waitForText('0 of 8 placed');
  };
  await openVillage();
  await loading.promise;
  await waitForText('Loading village…');
  const indicator = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, indicator, 85, 140), [23, 57, 45, 255], 'The tray should show the loading backdrop');
  assert.notDeepEqual(await pixelAt(page, indicator, 542, 348), [25, 46, 40, 255], 'The board guide should show the loading backdrop');

  await page.mouse.click(99, 43);
  await waitForText('Windmill');
  // Returning to the picker can cancel the browser request before the held route resumes.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  release.resolve();
  const loaded = page.waitForResponse((response) => atlas.test(response.url()) && response.ok());
  await openVillage();
  await loaded;
  const board = { x: 435, y: 275, width: 590, height: 320 };
  const artwork = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, artwork, 85, 140), [23, 57, 45, 255], 'The artwork should replace the loading backdrop');
  const before = await page.screenshot({ clip: board });
  await page.evaluate(async () => {
    for (let frame = 0; frame < 12; frame += 1) await new Promise(requestAnimationFrame);
  });
  const after = await page.screenshot({ clip: board });
  assert.ok(!before.equals(after), 'The captured village should animate');
  assert.deepEqual(errors, []);
});

test('Hex Coast captures continuous roads and animated water', async (t) => {
  const { page, waitForText, errors, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  const atlasLoaded = (name) => page.waitForResponse((response) =>
    new RegExp(`/${name}-[^/]+\\.png$`).test(response.url()) && response.ok());
  const atlases = Promise.all([atlasLoaded('fullTiles'), atlasLoaded('buildings')]);
  await page.mouse.move(935, 300);
  await page.mouse.wheel(0, 2200);
  await page.mouse.click(935, 600);
  await waitForText('Animation speed');
  await page.evaluate(() => {
    // Seed the selection itself, after picker and renderer startup have finished.
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (values) => {
      if (!(values instanceof Uint32Array) || values.length !== 1) return getRandomValues(values);
      crypto.getRandomValues = getRandomValues;
      values[0] = 1_011_889;
      return values;
    };
  });
  await playSelection({ animationSpeed: 'Fast' });
  const [[terrain]] = await Promise.all([atlases, waitForText('0 of 8 placed')]);
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

  const board = { x: 435, y: 275, width: 590, height: 320 };
  await page.waitForFunction(() => window.paintedText.filter((text) => text === 'Hex Coast').length >= 2);
  await page.waitForTimeout(200);
  const before = await page.screenshot({ clip: board });
  const { width, data } = PNG.sync.read(before);
  // Use the part of the fixed seed's horizontal road that is visible between foreground trees.
  const roadY = 358 - board.y;
  for (let screenX = 690; screenX <= 770; screenX += 1) {
    const pixel = (roadY * width + screenX - board.x) * 4;
    const [red, green, blue] = data.subarray(pixel, pixel + 3);
    assert.ok(Math.abs(red - 73) <= 2 && Math.abs(green - 80) <= 2 && Math.abs(blue - 59) <= 2,
      `Horizontal road should cover x=${screenX}, got ${red},${green},${blue}`);
  }
  await page.evaluate(async () => {
    for (let frame = 0; frame < 12; frame += 1) await new Promise(requestAnimationFrame);
  });
  const after = await page.screenshot({ clip: board });
  assert.ok(!before.equals(after), 'Water movement should change the captured puzzle');
  assert.deepEqual(errors, []);
});

test('picker Settings remembers the theme and filter on a narrow touch screen', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog } = await openPuzzle(t, {
    viewport: { width: 375, height: 640 }, hasTouch: true, isMobile: true,
  });
  await waitForText('Select a Puzzle');
  const forest = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, forest, 5, 105), [38, 58, 54, 255]);
  await page.touchscreen.tap(301, 39);
  await waitForText('Color theme');
  await clickDialog(21, -80);
  await clickDialog(-65, 81);
  await clickDialog(101, 153);
  const slate = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, slate, 5, 105), [39, 51, 68, 255]);
  assert.deepEqual(await pixelAt(page, slate, 5, 130), [39, 51, 68, 255], 'The Phaser canvas background should change too');
  assert.deepEqual(await pixelAt(page, slate, 75, 170), await pixelAt(page, forest, 75, 170), 'Preview artwork should keep its colors');
  await page.reload();
  await waitForText('Select a Puzzle');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 5, 105), [39, 51, 68, 255]);
  await page.touchscreen.tap(301, 39);
  await waitForText('Faded');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 64, 400), [200, 222, 248, 255], 'The saved filter should be selected after reload');
  assert.deepEqual(errors, []);
});

test('the picker scrolls past two cards and clips previews', async (t) => {
  await build({
    base: '/picker-fixture/',
    build: {
      outDir: 'dist/picker-fixture',
      rollupOptions: { input: 'tests/fixtures/puzzle-picker.html' },
    },
  });
  const path = '/picker-fixture/tests/fixtures/puzzle-picker.html';
  const previewColor = [255, 0, 255, 255];
  await t.test('mouse wheel scrolls to a selectable third card', async (t) => {
    const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openPuzzle(t, { viewport: { width: 1320, height: 540 } }, path);
    const initial = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, initial, 120, 165), [192, 221, 219, 255]);
    assert.notDeepEqual(await pixelAt(page, initial, 800, 165), [38, 58, 54, 255], 'The second card should sit beside the first');
    await page.setViewportSize({ width: 768, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 768);
    const narrow = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, narrow, 140, 165), [192, 221, 219, 255]);
    assert.deepEqual(await pixelAt(page, narrow, 700, 165), [38, 58, 54, 255], 'The same picker should reflow to one column');
    await page.setViewportSize({ width: 1320, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 1320);
    await page.mouse.move(340, 300);
    await page.mouse.wheel(0, 1000);
    const scrolled = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, scrolled, 120, 165), previewColor);
    for (const [x, y] of [[50, 165], [582, 165], [120, 148], [120, 452]]) {
      assert.notDeepEqual(await pixelAt(page, scrolled, x, y), previewColor, `Artwork should stay inside all four preview edges (${x}, ${y})`);
    }
    await page.mouse.click(340, 165);
    await waitForText('Connector style');
    assert.equal(await page.evaluate(() => window.paintedText.includes('Large · 32')), false);
    const selectedFill = [75, 108, 94, 255];
    const beforeSelection = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, beforeSelection, 467, 289), selectedFill);
    const iconFill = [101, 135, 122, 255];
    assert.deepEqual(await pixelAt(page, beforeSelection, 480, 142), iconFill, 'The size illustration should draw above the dialog and tile');
    assert.deepEqual(await pixelAt(page, beforeSelection, 816, 282), iconFill, 'The connector illustration should draw above the dialog and tile');
    await clickDialog(-52, 19);
    const afterSelection = await canvas.screenshot();
    assert.notDeepEqual(await pixelAt(page, afterSelection, 467, 289), selectedFill);
    assert.deepEqual(await pixelAt(page, afterSelection, 571, 289), selectedFill);
    await page.setViewportSize({ width: 375, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 375);
    const [cornerRed] = await pixelAt(page, await canvas.screenshot(), 373, 538);
    assert.ok(cornerRed < 38, 'The modal backdrop should still reach the corner after resizing');
    await page.setViewportSize({ width: 1320, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 1320);
    await page.mouse.move(340, 165);
    await page.mouse.wheel(0, -1000);
    await clickDialog(58, 200);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 120, 165), previewColor, 'Cancel should preserve the picker scroll position');
    await page.mouse.click(340, 165);
    await playSelection();
    await waitForText('0 of 8 placed');
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Normal');
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(99, 43);
    await waitForText('Select a Puzzle');
    await page.mouse.move(340, 300);
    await page.mouse.wheel(0, 1000);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 120, 165), previewColor);
    await page.mouse.click(340, 165);
    await playSelection({ animationSpeed: 'Slow' });
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Slow');
    assert.deepEqual(errors, []);
  });

  await t.test('touch can swipe from a preview and tap a different puzzle', async (t) => {
    const { page, canvas, waitForText, errors, playSelection } = await openPuzzle(t, {
      viewport: { width: 768, height: 780 },
      hasTouch: true,
      isMobile: true,
    }, path);
    const touch = await page.context().newCDPSession(page);
    const swipeUp = async (x, startY, endY) => {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
      for (let step = 1; step <= 10; step += 1) {
        const y = startY + (endY - startY) * step / 10;
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };

    const initial = await canvas.screenshot();
    await swipeUp(400, 265, 43);
    assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 140, 244), await pixelAt(page, initial, 140, 244));
    assert.equal(await page.evaluate(() => window.paintedText.includes('Connector style')), false, 'A swipe should keep the options closed');
    await swipeUp(170, 700, 180);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 140, 410), previewColor, 'A swipe should reveal the third card');
    await page.touchscreen.tap(400, 410);
    await playSelection({ connectorStyle: 'None', animationSpeed: 'Fast' });
    await waitForText('0 of 8 placed');
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Fast');
    assert.deepEqual(errors, []);
  });
});

test('tablet touch scrolls, resizes, zooms, cancels, and places pieces', async (t) => {
  const { page, canvas, waitForText, errors, playSelection } = await openPuzzle(t, {
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
  });
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

  await page.touchscreen.tap(522, 180);
  await playSelection();
  await waitForText('0 of 8 placed');
  const startingPiece = await pixelAt(page, await canvas.screenshot(), 85, 140);
  await moveFinger(85, 254, 85, 140);
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 85, 140), startingPiece, 'A swipe starting on a piece should scroll');
  await moveFinger(85, 140, 85, 254);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 85, 140), startingPiece);
  await moveFinger(167, 414, 450, 414);
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 199, 140), [48, 72, 65, 255], 'The touch divider should reflow the tray');

  const panelBackground = [25, 46, 40, 255];
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 900, 216), panelBackground);
  await dispatch('touchStart', [530, 372]);
  await dispatch('touchStart', [530, 372], [650, 372]);
  await dispatch('touchMove', [500, 372], [680, 372]);
  await dispatch('touchEnd');
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 900, 227), panelBackground, 'A pinch should enlarge the board artwork');

  await moveFinger(85, 253, 508, 327, 'touchCancel');
  assert.equal(await page.evaluate(() => window.paintedText.includes('1 of 8 placed')), false, 'A cancelled touch should not place a piece');
  await dispatch('touchStart', [85, 253]);
  await dispatch('touchMove', [55, 253]);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 140, 253), [48, 72, 65, 255],
    'A leftward move should leave the piece in the tray');
  await dispatch('touchEnd');
  await dispatch('touchStart', [85, 253]);
  await dispatch('touchMove', [85, 265]);
  await dispatch('touchMove', [99, 288]);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 145, 285), [192, 221, 219, 255],
    'A rightward drag near 70° should lift the piece after a small vertical start');
  await dispatch('touchMove', [508, 327]);
  await dispatch('touchEnd');
  await waitForText('1 of 8 placed');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 508, 327), [192, 221, 219, 255], 'A touch drop should snap at the zoomed target');
  await moveFinger(700, 500, 850, 500);
  const panned = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, panned, 508, 327), panelBackground, 'One finger should pan the zoomed board');
  assert.deepEqual(await pixelAt(page, panned, 658, 327), [192, 221, 219, 255], 'Placed pieces should follow the pan');

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => document.querySelector('canvas').height === 1024);
  await page.evaluate(() => { window.paintedText = []; });
  await page.touchscreen.tap(99, 43);
  await waitForText('Windmill');
  await page.touchscreen.tap(395, 180);
  await playSelection({ size: 'Expert · 128', connectorStyle: 'Rounded' });
  await waitForText('0 of 128 placed');
  const expertTray = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, expertTray, 105, 140), [48, 72, 65, 255], 'The smallest pieces should scale up to the tray target');
  assert.deepEqual(errors, []);
});
