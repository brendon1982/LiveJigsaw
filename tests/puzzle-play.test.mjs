import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { build, preview } from 'vite';

const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });

const settingsY = { theme: -159, firstFilter: -60, secondFilter: 2, firstTray: 98, secondTray: 160, done: 232 };
const setupY = { size: -155, connector: -44, speed: 67, challenge: 163, action: 233 };

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

async function openPuzzle(t, options, path = '/', initPage) {
  const { page, canvas, waitForText, errors, origin } = await openGamePage(t, options);
  await initPage?.(page);
  await page.goto(`${origin}${path}`);
  await waitForText('Windmill');
  const clickDialog = async (dx, dy) => {
    // Phaser uses the camera's render list for hit testing.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const { x, y, width, height } = await canvas.boundingBox();
    const tap = options.hasTouch ? page.touchscreen.tap.bind(page.touchscreen) : page.mouse.click.bind(page.mouse);
    await tap(x + width / 2 + dx, y + height / 2 + dy);
  };
  const clickSetup = async (dx, dy) => {
    const { width, height } = await canvas.boundingBox();
    const scale = Math.min(1, (width - 24) / 448, (height - 24) / 558);
    await clickDialog(dx * scale, dy * scale);
  };
  const playSelection = async ({ size, connectorStyle, animationSpeed, challengeMode } = {}) => {
    await waitForText('Challenge mode');
    if (size) {
      const index = ['Classic · 8', 'Large · 32', 'Dense · 64', 'Expert · 128'].indexOf(size);
      assert.ok(index >= 0);
      await clickSetup(-156 + 104 * index, setupY.size);
    }
    if (connectorStyle) {
      const index = ['Classic', 'Rounded', 'Angular', 'None'].indexOf(connectorStyle);
      assert.ok(index >= 0);
      await clickSetup(-156 + 104 * index, setupY.connector);
    }
    if (animationSpeed) {
      const index = ['Slow', 'Normal', 'Fast'].indexOf(animationSpeed);
      assert.ok(index >= 0);
      await clickSetup(-156 + 104 * index, setupY.speed);
    }
    if (challengeMode) {
      const index = ['standard', 'sequential', 'sequential-window', 'no-guide', 'seed'].indexOf(challengeMode);
      assert.ok(index >= 0);
      await clickSetup(-169.6 + 84.8 * index, setupY.challenge);
    }
    await clickSetup(158, setupY.action);
  };
  return { page, canvas, waitForText, errors, clickDialog, clickSetup, playSelection };
}

scenario('the picker renders before requesting offscreen previews', async (t) => {
  const { page, canvas, waitForText, errors, origin } = await openGamePage(t, {
    viewport: { width: 768, height: 1024 },
    reducedMotion: 'reduce',
  });
  const gameScript = /\/assets\/index-[\w-]+\.js$/;
  const previewAsset = /\/assets\/preview-[\w-]+\.png$/;
  const requestedPreviews = [];
  const scriptGate = Promise.withResolvers();
  const previewGate = Promise.withResolvers();
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

    scriptGate.resolve();
    await waitForText('Select a Puzzle');
    await status.waitFor({ state: 'detached', timeout: 4000 });
    assert.deepEqual(requestedPreviews, [], 'The first screen contains only drawn previews');

    await page.mouse.move(380, 400);
    const previewRequested = page.waitForRequest(previewAsset, { timeout: 4000 });
    await page.mouse.wheel(0, 30000);
    await previewRequested;
    const placeholder = [48, 69, 63, 255];
    const bottomPreview = async () => pixelAt(page, await canvas.screenshot(), 380, 780);
    assert.deepEqual(await bottomPreview(), placeholder, 'A pending preview should leave the card in place');
    assert.ok(requestedPreviews.length >= 3 && requestedPreviews.length <= 4,
      `Expected only previews near the bottom, got ${requestedPreviews.length}`);
    previewGate.resolve();
    let artwork = await bottomPreview();
    for (let frame = 0; frame < 30 && artwork.every((channel, i) => channel === placeholder[i]); frame++) {
      artwork = await bottomPreview();
    }
    assert.notDeepEqual(artwork, placeholder, 'The preview should appear in the same card when it loads');
    await page.mouse.wheel(0, -30000);
    await canvas.screenshot();
    await page.mouse.wheel(0, 30000);
    assert.deepEqual(await bottomPreview(), artwork);
    assert.equal(new Set(requestedPreviews).size, requestedPreviews.length, 'Revisited cards should reuse their preview');
    assert.deepEqual(errors, []);
  } finally {
    scriptGate.resolve();
    previewGate.resolve();
  }
});

function trackPieceMaskDraws(page) {
  return page.addInitScript(() => {
    // Count actual mask draws, which camera clipping alone does not prevent.
    const maskPrograms = new WeakSet();
    const activeMasks = new WeakMap();
    let maskDraws = 0;
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
          if (activeMasks.get(this)) maskDraws++;
          return draw.apply(this, args);
        };
      }
    }
    window.countPieceMaskDraws = () => new Promise((resolve) => requestAnimationFrame(() => {
      maskDraws = 0;
      requestAnimationFrame(() => resolve(maskDraws));
    }));
  });
}

scenario('the Expert tray only draws nearby piece masks', async (t) => {
  const { page, waitForText, errors, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  }, '/', trackPieceMaskDraws);
  await page.mouse.click(340, 180);
  await playSelection({ size: 'Expert · 128' });
  await waitForText('0 of 128 placed');

  const assertMaskDraws = async () => {
    const draws = await page.evaluate(() => window.countPieceMaskDraws());
    assert.ok(draws > 1 && draws < 16, `Expected only visible tray masks, got ${draws} draws`);
  };
  await assertMaskDraws();
  await page.mouse.move(85, 140);
  await page.mouse.wheel(0, 30000);
  await assertMaskDraws();
  assert.deepEqual(errors, []);
});

scenario('live pieces scroll, reflow, and snap to the pannable board', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openPuzzle(t, { viewport: { width: 1320, height: 780 } });
  const bounds = await canvas.boundingBox();
  assert.equal(bounds.width, 1320);
  assert.equal(bounds.height, 780);
  const move = (x, y, steps) => page.mouse.move(bounds.x + x, bounds.y + y, { steps });
  const click = (x, y) => page.mouse.click(bounds.x + x, bounds.y + y);
  const clickSettings = paceRepeatClicks(() => click(1246, 43));
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
  await waitForText('· Standard');
  const header = await page.evaluate(() => window.paintedText);
  assert.ok(header.includes('All puzzles') && header.includes('Windmill'));
  assert.ok(!header.includes('Pieces') && !header.includes('Drag to pan · Scroll to zoom'));
  const initial = await canvas.screenshot();
  const sky = [192, 221, 219, 255];
  const panelBackground = [32, 46, 42, 255];
  assert.deepEqual(await pixelAt(page, initial, 1267, 113), panelBackground, 'Fit board should start hidden');
  assert.deepEqual(await pixelAt(page, initial, 1290, 100), panelBackground, 'The board should extend into the reclaimed space');
  const guide = await pixelAt(page, initial, 542, 348);
  assert.ok(guide[0] > 25 && guide[0] < sky[0], 'The board should show the artwork at low opacity');
  assert.notDeepEqual(await pixelAt(page, initial, 199, 140), sky, 'The tray should start with one column');
  await move(85, 140);
  await page.mouse.wheel(0, 150);
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
  await clickSettings();
  await waitForText('Color theme');
  await clickDialog(21, settingsY.theme);
  await clickDialog(101, settingsY.done);
  const slate = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, slate, 1290, 100), [33, 44, 59, 255], 'Settings should restyle the active board');
  assert.deepEqual(await pixelAt(page, slate, 735, 348), sky, 'The placed piece should stay at its zoomed position');
  await page.evaluate(() => { window.paintedText = []; });
  await clickSettings();
  await waitForText('Color theme');
  await clickDialog(102, settingsY.theme);
  await clickDialog(101, settingsY.done);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 1290, 100), [27, 28, 30, 255], 'Dark should use its own board colour');
  await page.evaluate(() => { window.paintedText = []; });
  await clickSettings();
  await waitForText('Color theme');
  await clickDialog(-95, settingsY.theme);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('live-jigsaw.save')).settings.theme === 'Forest');
  await page.keyboard.press('Escape');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const unfiltered = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, unfiltered, 1290, 100), panelBackground);
  const trayPieceColor = await pixelAt(page, unfiltered, 85, 140);
  assert.notDeepEqual(trayPieceColor, [52, 66, 62, 255], 'The sample should be on a tray piece');
  const guidePixel = (screenshot) => pixelAt(page, screenshot, 990, 348);
  const originalGuide = await guidePixel(unfiltered);
  const assertGuideColor = (actual, expected, message) => {
    assert.ok(actual.every((channel, i) => Math.abs(channel - expected[i]) <= 1),
      `${message}. Expected ${expected}, got ${actual}`);
  };
  assertGuideColor(originalGuide, [67, 85, 81, 255], 'The original guide should blend with the board at 22% opacity');

  const selectFilter = async (x, y, name) => {
    await page.evaluate(() => { window.paintedText = []; });
    await clickSettings();
    await waitForText('Black and White');
    const before = await guidePixel(await canvas.screenshot());
    await clickDialog(x, y);
    await page.waitForFunction((expected) => {
      return (JSON.parse(localStorage.getItem('live-jigsaw.save')).settings.filter ?? null) === expected;
    }, name);
    assert.notDeepEqual(await guidePixel(await canvas.screenshot()), before, 'The guide should change while Settings is still open');
    await clickDialog(101, settingsY.done);
    const screenshot = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, screenshot, 1290, 100), panelBackground, 'The area outside the guide should keep the theme color');
    assert.deepEqual(await pixelAt(page, screenshot, 735, 348), sky, 'The placed piece should keep its original color');
    assert.deepEqual(await pixelAt(page, screenshot, 85, 140), trayPieceColor, 'The tray piece should keep its original color');
    return guidePixel(screenshot);
  };
  assertGuideColor(await selectFilter(-65, settingsY.firstFilter, 'grayscale'), [107, 116, 113, 255], 'Black and White should blend with the board at 42% opacity');
  assertGuideColor(await selectFilter(88, settingsY.firstFilter, 'sepia'), [88, 92, 76, 255], 'Sepia should blend with the board at 22% opacity');
  assertGuideColor(await selectFilter(-65, settingsY.secondFilter, 'faded'), [94, 108, 105, 255], 'Faded should blend with the board at 42% opacity');

  await move(735, 348);
  await page.mouse.wheel(0, 200);
  await move(199, 253);
  await page.mouse.down();
  await move(863, 348, 8);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 863, 348), sky, 'The dragged piece should keep its original color');
  await page.mouse.up();
  const highlighted = await canvas.screenshot();
  await waitForText('2 of 8 placed');
  const seamPoints = [[798, 337], [802, 339], [811, 342], [815, 348], [809, 357]];
  const seamColors = (screenshot) => {
    const { width, data } = PNG.sync.read(screenshot);
    return seamPoints.map(([x, y]) => [...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)]);
  };
  assert.ok(seamColors(highlighted).some(([red]) => red > sky[0]), 'The newly joined seam should briefly light up');
  let joined = highlighted;
  const fadeDeadline = Date.now() + 2000;
  const isSky = (color) => color.every((channel, index) => channel === sky[index]);
  while (!seamColors(joined).every(isSky) && Date.now() < fadeDeadline) {
    joined = await canvas.screenshot();
  }
  assert.deepEqual(await pixelAt(page, joined, 863, 348), sky, 'A newly placed piece should keep its original color');
  for (const color of seamColors(joined)) {
    assert.deepEqual(color, sky, 'The live guide should not show through joined pieces');
  }
  assert.deepEqual(await selectFilter(88, settingsY.secondFilter, null), originalGuide, 'Clearing the filter should restore the original guide');

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
  await seedNextAttempt(page, 49);
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
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 1267, 113), [237, 243, 233, 255], 'Panning should show the four-way arrow');
  await click(1267, 113);
  const fitted = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, fitted, 1267, 113), panelBackground, 'Fit board should hide after resetting the view');
  assert.deepEqual(await pixelAt(page, fitted, 900, 205), panelBackground, 'The large board should fit vertically when scaled to the narrowed panel');
  assert.notDeepEqual(await pixelAt(page, fitted, 900, 240), panelBackground, 'The fitted board should be centered');

  await page.setViewportSize({ width: 900, height: 620 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 900);
  await page.evaluate(() => { window.paintedText = []; });
  await click(99, 43);
  await waitForText('Windmill');
  await click(460, 180);
  await waitForText('Resume');
  await clickDialog(-6, 44);
  await seedNextAttempt(page, 1);
  await playSelection({ size: 'Classic · 8' });
  await waitForText('0 of 8 placed');
  const replay = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, replay, 85, 140), sky);
  assert.notDeepEqual(await pixelAt(page, initial, 85, 140), sky, 'Resetting with a fresh seed should change the tray order');
  await page.evaluate(() => { window.paintedText = []; });
  await click(99, 43);
  await waitForText('Windmill');
  await click(340, 180);
  await playSelection({ size: 'Dense · 64' });
  await waitForText('0 of 64 placed');
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 85, 140), [52, 66, 62, 255], 'The dense tray should render its thumbnails');
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
  const board = { x: 435, y: 275, width: 590, height: 320 };
  const emptyGuide = [32, 46, 42, 255];

  for (const [index, title] of selections.flat().entries()) {
    const rows = [1, 2, 4, 5, 6, 7, 8, 9];
    const scroll = Math.round((rows[Math.floor(index / 2)] * 403 - 300) / 0.75);
    await scrollPickerTo(page, scroll);
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(index % 2 ? 935 : 340, 570);
    await playSelection({ connectorStyle: 'Angular', animationSpeed: 'Fast' });
    await waitForText(title);
    await waitForText('0 of 8 placed');
    let firstArtwork;
    let animated = false;
    for (const deadline = Date.now() + 4000; Date.now() < deadline;) {
      const frame = await page.screenshot({ clip: board });
      if (!firstArtwork) {
        const sample = await pixelAt(page, frame, 302, 165);
        if (sample.some((channel, index) => channel !== emptyGuide[index])) firstArtwork = frame;
      } else if (!firstArtwork.equals(frame)) {
        animated = true;
        break;
      }
    }
    assert.ok(firstArtwork, `${title} should fill the board guide`);
    assert.ok(animated, `${title} should animate the captured artwork`);
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(99, 43);
    await waitForText('Windmill');
  }
  assert.deepEqual(errors, []);
});

scenario('parallax seeds place both foreground and background artwork', async (t) => {
  const { page, waitForText, errors, playSelection } = await openPuzzle(t, { viewport: { width: 1320, height: 780 } });

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

    const row = await page.screenshot({ clip: { x: 478, y: rowY, width: 512, height: 1 } });
    const { width, data } = PNG.sync.read(row);
    const artworkPixels = [];
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = data.subarray(x * 4, x * 4 + 3);
      if (matches(red, green, blue)) artworkPixels.push(x);
    }
    assert.ok(artworkPixels.length > 0, `The ${name} should be visible for seed ${seed}`);
    const position = (artworkPixels[0] + artworkPixels.at(-1)) / 2 / width;

    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(99, 43);
    await waitForText('Windmill');
    return position;
  };

  const seededArtwork = [
    {
      name: 'cactus', cardX: 340, scroll: 1700, rowY: 552,
      matches: (red, green, blue) => green > red + 10 && green > blue + 5,
    },
    {
      name: 'sun', cardX: 935, scroll: 2300, rowY: 331,
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

scenario('the medieval village is captured during loading and animates after reopening', async (t) => {
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
    await scrollPickerTo(page, 1210);
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
  assert.notDeepEqual(await pixelAt(page, indicator, 542, 348), [32, 46, 42, 255], 'The board guide should show the loading backdrop');

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

scenario('Hex Coast captures continuous roads and animated water', async (t) => {
  const { page, waitForText, errors, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  const atlasLoaded = (name) => page.waitForResponse((response) =>
    new RegExp(`/${name}-[^/]+\\.png$`).test(response.url()) && response.ok());
  const atlases = Promise.all([atlasLoaded('fullTiles'), atlasLoaded('buildings')]);
  await scrollPickerTo(page, 1210);
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
    assert.ok(Math.abs(red - 74) <= 2 && Math.abs(green - 77) <= 2 && Math.abs(blue - 59) <= 2,
      `Horizontal road should cover x=${screenX}, got ${red},${green},${blue}`);
  }
  await page.evaluate(async () => {
    for (let frame = 0; frame < 12; frame += 1) await new Promise(requestAnimationFrame);
  });
  const after = await page.screenshot({ clip: board });
  assert.ok(!before.equals(after), 'Water movement should change the captured puzzle');
  assert.deepEqual(errors, []);
});

scenario('picker Settings remembers the theme and filter on a narrow touch screen', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog } = await openPuzzle(t, {
    viewport: { width: 375, height: 640 }, hasTouch: true, isMobile: true,
  });
  await waitForText('Select a Puzzle');
  const forest = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, forest, 5, 105), [38, 58, 54, 255]);
  await page.touchscreen.tap(301, 39);
  await waitForText('Color theme');
  await clickDialog(21, settingsY.theme);
  await clickDialog(-65, settingsY.secondFilter);
  await clickDialog(101, settingsY.done);
  const slate = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, slate, 5, 105), [39, 51, 68, 255]);
  assert.deepEqual(await pixelAt(page, slate, 5, 130), [39, 51, 68, 255], 'The Phaser canvas background should change too');
  assert.deepEqual(await pixelAt(page, slate, 75, 170), await pixelAt(page, forest, 75, 170), 'Preview artwork should keep its colors');
  await page.reload();
  await waitForText('Select a Puzzle');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 5, 105), [39, 51, 68, 255]);
  await page.touchscreen.tap(301, 39);
  await waitForText('Faded');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 64, 321), [76, 102, 135, 255], 'The saved filter should use the Slate selected tile fill after reload');
  await clickDialog(102, settingsY.theme);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('live-jigsaw.save')).settings.theme === 'Dark');
  await clickDialog(101, settingsY.done);
  const dark = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, dark, 5, 105), [33, 33, 33, 255]);
  assert.deepEqual(await pixelAt(page, dark, 75, 170), await pixelAt(page, forest, 75, 170), 'Dark should preserve preview artwork');
  await page.reload();
  await waitForText('Select a Puzzle');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 5, 105), [33, 33, 33, 255]);
  await page.evaluate(() => {
    localStorage.removeItem('live-jigsaw.save');
    localStorage.setItem('live-jigsaw.theme', 'Slate');
    localStorage.setItem('live-jigsaw.puzzle-filter', 'sepia');
  });
  await page.reload();
  await waitForText('Select a Puzzle');
  assert.deepEqual((await readSave(page)).settings, {
    theme: 'Slate', filter: 'sepia', trayFractions: { vertical: 0, horizontal: 0 },
  });
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 5, 105), [39, 51, 68, 255]);
  assert.deepEqual(errors, []);
});

scenario('version 1 and 2 saves migrate with settings, options, progress, and history intact', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog } = await openPuzzle(t, { viewport: { width: 1320, height: 780 } });
  const setup = {
    size: { label: 'Classic', width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 },
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
  const standardSetup = { ...setup, challengeMode: 'standard' };
  for (const previous of [original, { ...original, version: 2, settings: { ...original.settings, trayFractions } }]) {
    await storeSave(previous);
    await page.reload();
    await waitForText('Completed');
    await waitForText('1 of 8 placed');
    assert.deepEqual(await readSave(page), {
      version: 3,
      settings: { ...original.settings, trayFractions },
      recentOptions: { ...original.recentOptions, challengeMode: 'standard' },
      progress: { Windmill: { ...original.progress.Windmill, setup: standardSetup } },
      history: { Lighthouse: [{ ...original.history.Lighthouse[0], setup: standardSetup }] },
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
  assert.ok(hasStatusInk(await canvas.screenshot(), 470, 457, 625, 474), 'Status should align to the right on a wide card');
  await page.setViewportSize({ width: 320, height: 780 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 320);
  assert.ok(hasStatusInk(await canvas.screenshot(), 30, 336, 185, 358), 'Status should have its own line on a narrow card');
  await page.setViewportSize({ width: 1320, height: 780 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 1320);
  await canvas.screenshot();
  await page.mouse.click(340, 180);
  await waitForText('1 of 8 pieces placed');

  const future = { ...original, version: 99, futureField: { keep: true } };
  await storeSave(future);
  await page.reload();
  await waitForText('Windmill');
  await page.mouse.click(1246, 43);
  await waitForText('Color theme');
  await clickDialog(102, settingsY.theme);
  await clickDialog(101, settingsY.done);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 5, 105), [33, 33, 33, 255], 'The new setting should apply in memory');
  assert.deepEqual(await readSave(page), future, 'A settings change should leave a newer save intact');
  assert.deepEqual(errors, []);
});

scenario('Sequential locks tray pieces while keeping touch scrolling and saves the active order', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const { moveFinger } = await touchController(page);
  await page.touchscreen.tap(340, 180);
  await playSelection({ connectorStyle: 'None', challengeMode: 'sequential' });
  await waitForText('0 of 8 placed');
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

  await moveFinger(146, 420, 552, 420);
  await page.mouse.move(168, 136);
  await page.mouse.down();
  await page.mouse.move(1118, 348, { steps: 6 });
  await page.mouse.up();
  assert.equal((await save()).progress.Windmill, undefined, 'A disabled piece should not lift with the mouse');
  await moveFinger(75, 136, 990, 492, 'touchCancel');
  assert.equal((await save()).progress.Windmill, undefined);
  assert.deepEqual(await firstSlot(), firstColor, 'Cancellation should return the same active piece');
  await moveFinger(75, 136, 990, 492);
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
  await clickDialog(100, 44);
  assert.deepEqual(await firstSlot(), nextColor);
  await moveFinger(75, 136, 1118, 348);
  await waitForText('2 of 8 placed');
  assert.deepEqual((await save()).progress.Windmill.placedPieceIds, ['piece-1-2', 'piece-0-3']);
  assert.deepEqual(errors, []);
});

scenario('Seed previews an on-target disconnected drop without saving it', async (t) => {
  const { page, canvas, waitForText, errors, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 }, hasTouch: true, isMobile: true,
  });
  const { moveFinger } = await touchController(page);
  const message = 'Piece must be connected to seed group';
  await page.touchscreen.tap(340, 180);
  await playSelection({ connectorStyle: 'None', challengeMode: 'seed' });
  await waitForText('0 of 8 placed');
  await moveFinger(146, 420, 552, 420);
  await moveFinger(75, 136, 990, 492);
  await waitForText('1 of 8 placed');
  const saved = await readSave(page);
  assert.deepEqual(saved.progress.Windmill.placedPieceIds, ['piece-1-2']);

  await moveFinger(75, 136, 990, 348);
  assert.equal(await page.evaluate((text) => window.paintedText.includes(text), message), false,
    'An ordinary miss should not show a rule warning');

  await page.mouse.move(1118, 348);
  await page.mouse.wheel(0, -200);
  const before = await canvas.screenshot();
  await page.mouse.move(75, 136);
  await page.mouse.down();
  await page.mouse.move(1118, 348, { steps: 6 });
  await page.mouse.up();
  const preview = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, preview, 1118, 348), await pixelAt(page, before, 1118, 348),
    'The rejected piece should briefly appear at its target on the zoomed board');
  const { width, data } = PNG.sync.read(preview);
  const hasRedOutline = [1019, 1020, 1021, 1022, 1023, 1024].some((x) => {
    const [red, green, blue] = data.subarray((348 * width + x) * 4);
    return red > Math.max(green, blue) + 40;
  });
  assert.ok(hasRedOutline, 'The preview should have a red outline');
  await waitForText(message);
  assert.deepEqual(await readSave(page), saved, 'A rejected drop should not save or change progress');

  const targetBefore = await pixelAt(page, before, 1118, 348);
  const returnDeadline = Date.now() + 2000;
  let returned;
  let after;
  do {
    after = await canvas.screenshot();
    returned = await pixelAt(page, after, 1118, 348);
  } while (returned.some((channel, i) => channel !== targetBefore[i]) && Date.now() < returnDeadline);
  assert.deepEqual(returned, targetBefore, 'The preview should disappear after the pulse');
  assert.deepEqual(await pixelAt(page, after, 660, 756), [71, 37, 42, 255],
    'The screen-space toast should still be visible after the preview ends');

  await moveFinger(168, 136, 1118, 564);
  await waitForText('2 of 8 placed');
  await moveFinger(75, 136, 1118, 348);
  await waitForText('3 of 8 placed');
  assert.deepEqual((await readSave(page)).progress.Windmill.placedPieceIds, ['piece-1-2', 'piece-1-3', 'piece-0-3']);
  assert.deepEqual(errors, []);
});

scenario('No Guide progress resumes, resets, and records each completion', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, clickSetup, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  const pickWindmill = () => page.mouse.click(340, 180);
  const backToPicker = async () => {
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(99, 43);
    await waitForText('Select a Puzzle');
  };
  const drag = async (x, y, targetX, targetY) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 6 });
    await page.mouse.up();
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const widenTray = () => drag(146, 420, 552, 420);
  const targets = [348, 492].flatMap((y, row) => [734, 862, 990, 1118].map((x, column) => ({
    x, y, id: `piece-${row}-${column}`,
  })));
  const getAttempt = async () => (await readSave(page)).progress.Windmill;
  const getHistory = async () => (await readSave(page)).history.Windmill ?? [];
  const placeNextPiece = async () => {
    const placedIds = (await getAttempt())?.placedPieceIds ?? [];
    const completedCount = (await getHistory()).length;
    for (const target of targets) {
      if (placedIds.includes(target.id)) continue;
      await drag(75, 136, target.x, target.y);
      const saved = await getAttempt();
      if (saved?.placedPieceIds.length > placedIds.length || (await getHistory()).length > completedCount) {
        return target;
      }
    }
    assert.fail('The first tray piece should snap to one of the unfilled targets');
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
  const guide = await canvas.screenshot();
  const boardBackground = [32, 46, 42, 255];
  assert.deepEqual(await pixelAt(page, guide, 734, 348), boardBackground);
  assert.deepEqual(await pixelAt(page, guide, 670, 400), [113, 137, 126, 255], 'A border should mark the puzzle bounds');
  await page.mouse.click(1246, 43);
  await waitForText('Black and White');
  await clickDialog(21, settingsY.theme);
  await clickDialog(-65, settingsY.firstFilter);
  await clickDialog(101, settingsY.done);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 734, 348), [33, 44, 59, 255],
    'Theme and filter changes should keep the guide hidden');
  await page.mouse.click(1246, 43);
  await waitForText('Color theme');
  await clickDialog(-95, settingsY.theme);
  await clickDialog(101, settingsY.done);
  const firstTarget = await placeNextPiece();
  const firstSave = await getAttempt();
  assert.deepEqual(firstSave.placedPieceIds, [firstTarget.id]);
  assert.equal(firstSave.setup.connectorStyle, 'none');
  assert.equal(firstSave.setup.animationSpeed, 'Fast');
  assert.equal(firstSave.setup.challengeMode, 'no-guide');
  assert.equal(firstSave.setup.size.label, 'Classic');
  assert.ok(Number.isInteger(firstSave.setup.seed));
  const placedColor = await pixelAt(page, await canvas.screenshot(), firstTarget.x, firstTarget.y);
  assert.notDeepEqual(placedColor, await pixelAt(page, guide, firstTarget.x, firstTarget.y));

  await page.reload();
  await waitForText('Select a Puzzle');
  await pickWindmill();
  await waitForText('1 of 8 pieces placed');
  await clickDialog(-6, 44);
  await waitForText('Puzzle size');
  await clickSetup(-52, setupY.size);
  await page.keyboard.press('Escape');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(await getAttempt(), firstSave);
  assert.deepEqual((await readSave(page)).recentOptions, {
    sizeLabel: 'Classic', connectorStyle: 'none', animationSpeed: 'Fast', challengeMode: 'no-guide',
  });
  await page.evaluate(() => { window.paintedText = []; });
  await pickWindmill();
  await waitForText('Resume');
  await page.evaluate(() => { window.paintedText = []; });
  await clickDialog(100, 44);
  await waitForText('1 of 8 placed');
  await waitForText('· No Guide');
  await widenTray();
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), firstTarget.x, firstTarget.y), placedColor);
  for (let count = 1; count < targets.length; count += 1) await placeNextPiece();
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
  assert.deepEqual(await pixelAt(page, sliding, 37, 43), [58, 81, 75, 255], 'Navigation should stay visible during the reveal');
  assert.equal(await getAttempt(), undefined);
  assert.deepEqual((await getHistory()).map(({ setup }) => setup), [firstSave.setup]);
  assert.equal(await page.evaluate(() => window.paintedText.includes('Choose puzzle')), false,
    'The completed scene should have a moment before the next action');
  await waitForText('Choose puzzle');
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
  await clickDialog(-6, 44);
  await playSelection();
  await waitForText('0 of 8 placed');
  assert.equal(await getAttempt(), undefined);
  assert.equal((await getHistory()).length, 1);
  await widenTray();
  await placeNextPiece();
  const freshSetup = (await getAttempt()).setup;
  for (let count = 1; count < targets.length; count += 1) await placeNextPiece();
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
  await waitForText('Puzzle size');
  assert.equal(await page.evaluate(() => window.paintedText.includes('Resume')), false);
  assert.deepEqual(errors, []);
});

scenario('picker tag and completion filters combine and refresh after play', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  const setup = {
    size: { label: 'Classic', width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 },
    seed: 42, connectorStyle: 'none', animationSpeed: 'Normal', challengeMode: 'standard',
  };
  const original = {
    version: 3,
    settings: { trayFractions: { vertical: 0, horizontal: 0 } },
    progress: {
      Lighthouse: { setup, placedPieceIds: ['piece-0-0'] },
      Windmill: {
        setup,
        placedPieceIds: ['piece-0-1', 'piece-0-2', 'piece-0-3', 'piece-1-0', 'piece-1-1', 'piece-1-2', 'piece-1-3'],
      },
    },
    history: { Lighthouse: [{ setup, completedAt: '2025-01-01T12:00:00.000Z' }] },
  };
  await page.evaluate((save) => localStorage.setItem('live-jigsaw.save', JSON.stringify(save)), original);
  await page.reload();
  await waitForText('Countryside · Flat Illustration');
  await waitForText('Coast · Flat Illustration');

  const clickFilters = paceRepeatClicks(() => clickDialog(460, -347));
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
  await clickDialog(93, -180); // Coast
  await clickDialog(-119, -118); // Countryside
  const selectedTiles = await canvas.screenshot();
  const selectedFill = [75, 108, 94, 255];
  assert.deepEqual(await pixelAt(page, selectedTiles, 753, 195), selectedFill, 'Coast should use the selected tile fill');
  assert.deepEqual(await pixelAt(page, selectedTiles, 541, 257), selectedFill, 'Countryside should stay selected alongside Coast');
  await clickDialog(-109, 96); // Flat Illustration
  await clickDialog(-66, 187); // Completed
  await clickDialog(125, 257);
  await waitForText('Filters (4)');
  assert.deepEqual(await readSave(page), original);
  await pickFirst(660);
  await waitForText('Lighthouse');
  await waitForText('1 of 8 pieces placed');
  await page.keyboard.press('Escape');

  await openFilters();
  await clickDialog(-61, 257); // Clear the draft
  await clickDialog(29, 257); // Cancel
  await pickFirst(660);
  await waitForText('Lighthouse');
  await page.keyboard.press('Escape');

  await openFilters();
  await clickDialog(-61, 257);
  await clickDialog(93, -180); // Coast
  await clickDialog(2, 96); // Parallax
  await clickDialog(125, 257);
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
  await clickDialog(93, -180); // Coast
  await clickDialog(-119, -118); // Countryside
  await clickDialog(65, 187); // Never completed
  await clickDialog(125, 257);
  await waitForText('Filters (3)');
  const topOfResults = await canvas.screenshot();
  await scrollPickerTo(page, 200);
  assert.ok(!topOfResults.equals(await canvas.screenshot()), 'Three results should scroll across two rows');
  await pickFirst();
  await waitForText('7 of 8 pieces placed');
  await page.evaluate(() => { window.paintedText = []; });
  await clickDialog(100, 44); // Resume the unfinished first attempt.
  await waitForText('7 of 8 placed');
  await drag(146, 420, 552, 420);
  await drag(75, 136, 734, 348);
  await waitForText('8 of 8 placed');
  assert.equal((await readSave(page)).history.Windmill.length, 1);
  await waitForText('Choose puzzle');
  await page.evaluate(() => { window.paintedText = []; });
  await page.mouse.click(99, 43);
  await waitForText('Filters (3)');
  const shortenedResults = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, shortenedResults, 120, 405),
    await pixelAt(page, shortenedResults, 20, 405), 'The shorter result list should clamp back to the top');
  await pickFirst();
  await waitForText('Meadow');
  await waitForText('Puzzle size');
  assert.deepEqual(errors, []);
});

scenario('the picker preserves an active filter and its scroll offset until reload', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  await page.mouse.click(1120, 43);
  await waitForText('Type');
  await clickDialog(2, 96); // Parallax
  await clickDialog(125, 257);
  await waitForText('Filters (1)');
  await scrollPickerTo(page, 1000);
  const scrolled = await canvas.screenshot();
  await page.mouse.click(340, 340);
  await playSelection();
  await waitForText('0 of 8 placed');
  await page.evaluate(() => { window.paintedText = []; });
  await page.mouse.click(99, 43);
  await waitForText('Filters (1)');
  assert.ok(scrolled.equals(await canvas.screenshot()), 'The filtered list should return at the same offset');
  await page.reload();
  await waitForText('Windmill');
  await page.mouse.click(340, 180);
  await waitForText('Puzzle size');
  await waitForText('Windmill');
  assert.deepEqual(errors, []);
});

scenario('touch can scroll the filter dialog and apply choices on a short screen', async (t) => {
  const { page, canvas, waitForText, errors } = await openPuzzle(t, {
    viewport: { width: 640, height: 375 }, hasTouch: true, isMobile: true,
  });
  const { moveFinger } = await touchController(page);
  const firstPreview = await pixelAt(page, await canvas.screenshot(), 120, 165);
  await page.touchscreen.tap(445, 49);
  await waitForText('Theme');
  await page.touchscreen.tap(413, 135); // Coast
  await moveFinger(311, 247, 311, 90);
  await moveFinger(311, 247, 311, 90);
  await page.touchscreen.tap(385, 247); // Never completed, after scrolling the dialog body.
  await page.touchscreen.tap(445, 317);
  await waitForText('Filters (2)');
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 120, 165), firstPreview);
  assert.deepEqual(errors, []);
});

scenario('the picker scrolls past two cards and clips previews', async (t) => {
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
    const { page, canvas, waitForText, errors, clickSetup, playSelection } = await openPuzzle(t, { viewport: { width: 1320, height: 540 } }, path);
    const initial = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, initial, 120, 175), [192, 221, 219, 255]);
    assert.notDeepEqual(await pixelAt(page, initial, 800, 175), [38, 58, 54, 255], 'The second card should sit beside the first');
    await page.mouse.move(1208, 43);
    const hoveredButton = await pixelAt(page, await canvas.screenshot(), 1208, 43);
    await page.mouse.down();
    assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 1208, 43), hoveredButton, 'A held mouse button should look pressed');
    await page.mouse.move(1100, 43);
    await page.mouse.up();
    await page.mouse.move(1208, 43);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 1208, 43), hoveredButton, 'Moving off the button should clear the press');
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
      assert.equal(secondLeft - firstRight, 32, 'The inter-column gap should stay fixed');
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
    for (const [x, y] of [[70, 175], [633, 175], [120, 136], [120, 453], [73, 138]]) {
      assert.notDeepEqual(await pixelAt(page, scrolled, x, y), previewColor, `Artwork should stay inside all four preview edges (${x}, ${y})`);
    }
    for (const x of [73, 630]) {
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
    const paintedText = await page.evaluate(() => window.paintedText);
    assert.ok(paintedText.includes('Classic · 8'), 'Puzzle sizes should show their label and piece count');
    assert.ok(!paintedText.includes('Large · 32'));
    for (const label of ['Classic', 'Rounded', 'Angular', 'None']) {
      assert.ok(!paintedText.includes(label), `The ${label} connector option should not draw a caption`);
    }
    const selectedFill = [75, 108, 94, 255];
    const beforeSelection = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, beforeSelection, 491, 245), selectedFill);
    const iconFill = [101, 135, 122, 255];
    assert.deepEqual(await pixelAt(page, beforeSelection, 502, 116), selectedFill, 'The size tile should have no illustration');
    assert.deepEqual(await pixelAt(page, beforeSelection, 797, 235), iconFill, 'The connector illustration should draw above the dialog and tile');
    await clickSetup(-52, setupY.connector);
    const afterSelection = await canvas.screenshot();
    assert.notDeepEqual(await pixelAt(page, afterSelection, 491, 245), selectedFill);
    assert.deepEqual(await pixelAt(page, afterSelection, 582, 245), selectedFill);
    await page.setViewportSize({ width: 375, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 375);
    const [cornerRed] = await pixelAt(page, await canvas.screenshot(), 373, 538);
    assert.ok(cornerRed < 38, 'The modal backdrop should still reach the corner after resizing');
    await page.setViewportSize({ width: 1320, height: 540 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 1320);
    await page.mouse.move(340, 175);
    await page.mouse.wheel(0, -1000);
    await clickSetup(58, setupY.action);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 120, 175), previewColor, 'Cancel should preserve the picker scroll position');
    await page.mouse.click(340, 175);
    await playSelection();
    await waitForText('0 of 8 placed');
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Normal');
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(99, 43);
    await waitForText('Select a Puzzle');
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 120, 175), previewColor, 'Returning from play should restore the picker offset');
    await page.mouse.click(340, 175);
    await playSelection({ animationSpeed: 'Slow' });
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Slow');

    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(99, 43);
    await waitForText('Select a Puzzle');
    await scrollPickerTo(page, 0);
    await page.mouse.click(340, 175);
    await playSelection({ size: 'Large · 32', connectorStyle: 'None', animationSpeed: 'Fast' });
    await waitForText('0 of 32 placed');
    await page.reload();
    await waitForText('Windmill');
    await page.mouse.click(1003, 175);
    await playSelection();
    await waitForText('0 of 32 placed');
    assert.deepEqual((await readSave(page)).recentOptions, {
      sizeLabel: 'Large', connectorStyle: 'none', animationSpeed: 'Fast', challengeMode: 'standard',
    });

    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(99, 43);
    await waitForText('Select a Puzzle');
    await page.mouse.move(340, 300);
    await page.mouse.wheel(0, 1000);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 120, 175), previewColor);
    await page.mouse.click(340, 175);
    await playSelection();
    await waitForText('0 of 8 placed');
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Fast');
    assert.deepEqual((await readSave(page)).recentOptions, {
      sizeLabel: 'Classic', connectorStyle: 'none', animationSpeed: 'Fast', challengeMode: 'standard',
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
    await waitForText('0 of 8 placed');
    await page.waitForFunction(() => window.sourceAnimationSpeed === 'Fast');
    await page.evaluate(() => { window.paintedText = []; });
    await page.touchscreen.tap(99, 49);
    await waitForText('Select a Puzzle');
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 140, 410), previewColor,
      'Returning by touch should restore the swiped picker offset');
    assert.deepEqual(errors, []);
  });
});

scenario('tablet touch scrolls, resizes, zooms, cancels, and places pieces', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openPuzzle(t, {
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
  await moveFinger(167, 414, 450, 414);
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 199, 140), [52, 66, 62, 255], 'The touch divider should reflow the tray');

  const panelBackground = [32, 46, 42, 255];
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
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 140, 253), [52, 66, 62, 255],
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
  await page.touchscreen.tap(984, 119);
  const fitted = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, fitted, 535, 342), [192, 221, 219, 255], 'A tap near the edge of Fit board should recenter the placed piece');
  assert.deepEqual(await pixelAt(page, fitted, 900, 216), panelBackground, 'Fit board should restore the full artwork after a pinch');

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => document.querySelector('canvas').height === 1024);
  await page.evaluate(() => { window.paintedText = []; });
  await page.touchscreen.tap(99, 43);
  await waitForText('Windmill');
  await page.touchscreen.tap(395, 180);
  await waitForText('Resume');
  await page.evaluate(() => { window.paintedText = []; });
  await clickDialog(100, 44);
  await waitForText('1 of 8 placed');
  await page.evaluate(() => { window.paintedText = []; });
  await page.touchscreen.tap(99, 43);
  await waitForText('Windmill');
  await page.touchscreen.tap(395, 180);
  await waitForText('Resume');
  await clickDialog(-6, 44);
  await playSelection({ size: 'Expert · 128', connectorStyle: 'Rounded' });
  await waitForText('0 of 128 placed');
  const expertTray = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, expertTray, 85, 929), [52, 66, 62, 255], 'The smallest pieces should scale up to the bottom tray target');
  assert.deepEqual(errors, []);
});

scenario('tray settings move the live tray and rotate touch gestures with it', async (t) => {
  const portrait = { width: 680, height: 860 };
  const landscape = { width: 1024, height: 768 };
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openPuzzle(t, {
    viewport: portrait, hasTouch: true, isMobile: true,
  });
  const { dispatch, moveFinger } = await touchController(page);
  const trayColor = [52, 66, 62, 255];
  const boardColor = [32, 46, 42, 255];
  const selectedColor = [75, 108, 94, 255];
  const layout = {
    Left: { choice: [-102, settingsY.firstTray], first: [75, 136], scroll: [0, -52], lift: [85, 0] },
    Right: { choice: [0, settingsY.firstTray], first: [590, 136], scroll: [0, -52], lift: [-85, 0] },
    Bottom: { choice: [102, settingsY.firstTray], first: [71, 765], scroll: [-46, 0], lift: [0, -90] },
    Top: { choice: [-102, settingsY.secondTray], first: [71, 140], scroll: [-46, 0], lift: [0, 95] },
    Auto: { choice: [0, settingsY.secondTray] },
  };
  const sample = async (...point) => pixelAt(page, await canvas.screenshot(), ...point);
  const assertSide = async (side) => {
    const { width, height } = page.viewportSize();
    const points = {
      Left: [[26, 100], [width - 26, 100]],
      Right: [[width - 26, 100], [26, 100]],
      Bottom: [[26, height - 26], [26, 86]],
      Top: [[26, 86], [26, height - 26]],
    };
    const [trayPoint, boardPoint] = points[side];
    const frame = await canvas.screenshot();
    assert.deepEqual(await pixelAt(page, frame, ...trayPoint), trayColor, `Expected tray on the ${side}`);
    assert.deepEqual(await pixelAt(page, frame, ...boardPoint), boardColor, `Expected board opposite the ${side} tray`);
  };
  const tapSettings = paceRepeatClicks(() => page.touchscreen.tap(page.viewportSize().width - 74, 43));
  const openTraySettings = async () => {
    await page.evaluate(() => { window.paintedText = []; });
    await tapSettings();
    await waitForText('Puzzle tray');
  };
  const closeSettings = () => clickDialog(101, settingsY.done);
  const selectSide = async (side) => {
    await openTraySettings();
    await clickDialog(...layout[side].choice);
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
  assert.deepEqual(await sample(365, 591), selectedColor, 'Auto should be selected without a saved setting');
  await closeSettings();

  for (const side of ['Left', 'Right', 'Top', 'Bottom']) {
    await selectSide(side);
    await assertSide(side);
    const { first: [x, y], scroll: [scrollX, scrollY], lift: [liftX, liftY] } = layout[side];
    assert.notDeepEqual(await sample(x, y), trayColor, `Expected a piece at the start of the ${side} tray`);
    await moveFinger(x, y, x + scrollX, y + scrollY);
    assert.deepEqual(await sample(x, y), trayColor, `A swipe along the ${side} tray should scroll from a piece`);
    await moveFinger(x, y, x - scrollX, y - scrollY);
    assert.notDeepEqual(await sample(x, y), trayColor);
    await dispatch('touchStart', [x, y]);
    await dispatch('touchMove', [x + liftX, y + liftY]);
    assert.deepEqual(await sample(x, y), trayColor, `Pulling toward the board should lift from the ${side} tray`);
    await dispatch('touchCancel');
    assert.notDeepEqual(await sample(x, y), trayColor, 'Cancellation should return the piece to its slot');
  }

  const [trayX, trayY] = layout.Bottom.first;
  await page.mouse.move(trayX, trayY);
  for (const [dx, dy] of [[62, 0], [0, 62]]) {
    await page.mouse.wheel(dx, dy);
    assert.deepEqual(await sample(trayX, trayY), trayColor, 'Wheel input should scroll a horizontal tray');
    await page.mouse.wheel(-dx, -dy);
    assert.notDeepEqual(await sample(trayX, trayY), trayColor);
  }

  await dispatch('touchStart', [280, 392]);
  await dispatch('touchStart', [280, 392], [400, 392]);
  await dispatch('touchMove', [265, 392], [415, 392]);
  await dispatch('touchEnd');
  let placedAt;
  for (const y of [302, 482]) {
    for (const x of [100, 260, 420, 580]) {
      await dispatch('touchStart', [trayX, trayY]);
      await dispatch('touchMove', [trayX, trayY - 24]);
      await dispatch('touchMove', [x, y]);
      await dispatch('touchEnd');
      await canvas.screenshot();
      if ((await readSave(page)).progress.Windmill) {
        placedAt = [x, y];
        break;
      }
    }
    if (placedAt) break;
  }
  assert.ok(placedAt, 'A piece from the bottom tray should snap after pinch zoom');
  const placedColor = await sample(...placedAt);
  const savedProgress = (await readSave(page)).progress.Windmill;

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
  await moveFinger(146, 460, 245, 460);
  assert.deepEqual(await sample(200, 86), trayColor);
  const sideSizes = (await readSave(page)).settings.trayFractions;
  assert.ok(sideSizes.vertical > 0);
  assert.equal(sideSizes.horizontal, 0);
  await selectSide('Top');
  await moveFinger(340, 216, 340, 340);
  assert.deepEqual(await sample(26, 300), trayColor);
  const savedSizes = (await readSave(page)).settings.trayFractions;
  assert.equal(savedSizes.vertical, sideSizes.vertical);
  assert.ok(savedSizes.horizontal > 0);
  await selectSide('Bottom');
  assert.deepEqual(await sample(26, 630), trayColor, 'Top and Bottom should share the adjusted tray size');
  await selectSide('Right');
  assert.deepEqual(await sample(500, 86), trayColor, 'Right should restore the adjusted side tray size');
  await resize(landscape);
  await assertSide('Right');

  await page.reload();
  await waitForText('Windmill');
  await openTraySettings();
  assert.deepEqual(await sample(537, 489), selectedColor, 'Right should remain selected after reload');
  await closeSettings();
  await page.touchscreen.tap(522, 180);
  await waitForText('Resume');
  await page.evaluate(() => { window.paintedText = []; });
  await clickDialog(100, 44);
  await waitForText('1 of 8 placed');
  await assertSide('Right');
  assert.deepEqual(await sample(725, 86), trayColor, 'The saved tray width should return after reopening the puzzle');
  await selectSide('Bottom');
  assert.deepEqual(await sample(26, 565), trayColor, 'The saved tray height should return after reopening the puzzle');
  assert.deepEqual((await readSave(page)).settings.trayFractions, savedSizes);
  assert.deepEqual(errors, []);
});

const concurrency = Number(process.env.LIVE_JIGSAW_BROWSER_CONCURRENCY ?? 8);
describe('puzzle play', { concurrency }, () => {
  for (const { name, run } of scenarios) test(name, { concurrency: 1 }, run);
});
