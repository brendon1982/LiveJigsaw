import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { build, preview } from 'vite';

const settingsY = { theme: -159, firstFilter: -60, secondFilter: 2, firstTray: 98, secondTray: 160, done: 232 };

function readSave(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('live-jigsaw.save')));
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
    // Phaser uses the camera's render list for hit testing.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const { x, y, width, height } = await canvas.boundingBox();
    const tap = options.hasTouch ? page.touchscreen.tap.bind(page.touchscreen) : page.mouse.click.bind(page.mouse);
    await tap(x + width / 2 + dx, y + height / 2 + dy);
  };
  const playSelection = async ({ size, connectorStyle, animationSpeed } = {}) => {
    await waitForText('Animation speed');
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
  const panelBackground = [32, 46, 42, 255];
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
  await clickDialog(21, settingsY.theme);
  await clickDialog(101, settingsY.done);
  const slate = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, slate, 1290, 100), [33, 44, 59, 255], 'Settings should restyle the active board');
  assert.deepEqual(await pixelAt(page, slate, 735, 348), sky, 'The placed piece should stay at its zoomed position');
  await page.evaluate(() => { window.paintedText = []; });
  await click(1246, 43);
  await waitForText('Color theme');
  await clickDialog(102, settingsY.theme);
  await clickDialog(101, settingsY.done);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 1290, 100), [27, 28, 30, 255], 'Dark should use its own board colour');
  await page.evaluate(() => { window.paintedText = []; });
  await click(1246, 43);
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
    await click(1246, 43);
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
  await waitForText('Resume');
  await clickDialog(-6, 44);
  await playSelection({ size: 'Classic · 8' });
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
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 85, 140), [52, 66, 62, 255], 'The dense tray should render its thumbnails');
  assert.deepEqual(errors, []);
});

test('the landscape scenes animate on the board', async (t) => {
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

test('parallax seeds place both foreground and background artwork', async (t) => {
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

test('Hex Coast captures continuous roads and animated water', async (t) => {
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
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 64, 321), [200, 222, 248, 255], 'The saved filter should be selected after reload');
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

test('version 1 saves migrate with settings, options, progress, and history intact', async (t) => {
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
  await storeSave(original);
  await page.reload();
  await waitForText('Completed 1 times');
  assert.deepEqual(await readSave(page), {
    ...original, version: 2, settings: { ...original.settings, trayFractions: { vertical: 0, horizontal: 0 } },
  });
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

test('puzzle progress resumes, resets, and records each completion', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openPuzzle(t, {
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

  await waitForText('Completed 0 times');
  await pickWindmill();
  await playSelection({ connectorStyle: 'None', animationSpeed: 'Fast' });
  await waitForText('0 of 8 placed');
  assert.equal(await getAttempt(), undefined);
  await backToPicker();
  await pickWindmill();
  await playSelection();
  await waitForText('0 of 8 placed');
  assert.equal(await page.evaluate(() => window.paintedText.includes('Resume')), false);
  await widenTray();
  const guide = await canvas.screenshot();
  const firstTarget = await placeNextPiece();
  const firstSave = await getAttempt();
  assert.deepEqual(firstSave.placedPieceIds, [firstTarget.id]);
  assert.equal(firstSave.setup.connectorStyle, 'none');
  assert.equal(firstSave.setup.animationSpeed, 'Fast');
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
  await clickDialog(-52, -107);
  await page.keyboard.press('Escape');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(await getAttempt(), firstSave);
  assert.deepEqual((await readSave(page)).recentOptions, {
    sizeLabel: 'Classic', connectorStyle: 'none', animationSpeed: 'Fast',
  });
  await page.evaluate(() => { window.paintedText = []; });
  await pickWindmill();
  await waitForText('Resume');
  await clickDialog(100, 44);
  await waitForText('1 of 8 placed');
  await widenTray();
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), firstTarget.x, firstTarget.y), placedColor);
  for (let count = 1; count < targets.length; count += 1) await placeNextPiece();
  await waitForText('8 of 8 placed');
  assert.equal(await getAttempt(), undefined);
  assert.deepEqual((await getHistory()).map(({ setup }) => setup), [firstSave.setup]);

  await backToPicker();
  await waitForText('Completed 1 times');
  await waitForText('Completed 0 times');
  await pickWindmill();
  await playSelection();
  await waitForText('0 of 8 placed');
  await widenTray();
  await placeNextPiece();
  await backToPicker();
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
  await waitForText('Completed 2 times');
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
  await waitForText('Completed 2 times');
  await pickWindmill();
  await waitForText('Puzzle size');
  assert.equal(await page.evaluate(() => window.paintedText.includes('Resume')), false);
  assert.deepEqual(errors, []);
});

test('picker tag and completion filters combine and refresh after play', async (t) => {
  const { page, canvas, waitForText, errors, clickDialog } = await openPuzzle(t, {
    viewport: { width: 1320, height: 780 },
  });
  const setup = {
    size: { label: 'Classic', width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 28 },
    seed: 42, connectorStyle: 'none', animationSpeed: 'Normal',
  };
  const original = {
    version: 2,
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

  const openFilters = async () => {
    await clickDialog(460, -347);
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
  await clickDialog(100, 44); // Resume the unfinished first attempt.
  await waitForText('7 of 8 placed');
  await drag(146, 420, 552, 420);
  await drag(75, 136, 734, 348);
  await waitForText('8 of 8 placed');
  assert.equal((await readSave(page)).history.Windmill.length, 1);
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

test('the picker preserves an active filter and its scroll offset until reload', async (t) => {
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

test('touch can scroll the filter dialog and apply choices on a short screen', async (t) => {
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
    assert.deepEqual(await pixelAt(page, initial, 120, 175), [192, 221, 219, 255]);
    assert.notDeepEqual(await pixelAt(page, initial, 800, 175), [38, 58, 54, 255], 'The second card should sit beside the first');
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
    for (const [x, y] of [[86, 175], [618, 175], [120, 158], [120, 462]]) {
      assert.notDeepEqual(await pixelAt(page, scrolled, x, y), previewColor, `Artwork should stay inside all four preview edges (${x}, ${y})`);
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
    await page.mouse.move(340, 175);
    await page.mouse.wheel(0, -1000);
    await clickDialog(58, 200);
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
      sizeLabel: 'Large', connectorStyle: 'none', animationSpeed: 'Fast',
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
      sizeLabel: 'Classic', connectorStyle: 'none', animationSpeed: 'Fast',
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
    await page.evaluate(() => { window.paintedText = []; });
    await page.touchscreen.tap(99, 49);
    await waitForText('Select a Puzzle');
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 140, 410), previewColor,
      'Returning by touch should restore the swiped picker offset');
    assert.deepEqual(errors, []);
  });
});

test('tablet touch scrolls, resizes, zooms, cancels, and places pieces', async (t) => {
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

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => document.querySelector('canvas').height === 1024);
  await page.evaluate(() => { window.paintedText = []; });
  await page.touchscreen.tap(99, 43);
  await waitForText('Windmill');
  await page.touchscreen.tap(395, 180);
  await waitForText('Resume');
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

test('tray settings move the live tray and rotate touch gestures with it', async (t) => {
  const portrait = { width: 680, height: 860 };
  const landscape = { width: 1024, height: 768 };
  const { page, canvas, waitForText, errors, clickDialog, playSelection } = await openPuzzle(t, {
    viewport: portrait, hasTouch: true, isMobile: true,
  });
  const { dispatch, moveFinger } = await touchController(page);
  const trayColor = [52, 66, 62, 255];
  const boardColor = [32, 46, 42, 255];
  const selectedColor = [199, 225, 209, 255];
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
  const openTraySettings = async () => {
    await page.evaluate(() => { window.paintedText = []; });
    await page.touchscreen.tap(page.viewportSize().width - 74, 43);
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
  await clickDialog(100, 44);
  await waitForText('1 of 8 placed');
  await assertSide('Right');
  assert.deepEqual(await sample(725, 86), trayColor, 'The saved tray width should return after reopening the puzzle');
  await selectSide('Bottom');
  assert.deepEqual(await sample(26, 565), trayColor, 'The saved tray height should return after reopening the puzzle');
  assert.deepEqual((await readSave(page)).settings.trayFractions, savedSizes);
  assert.deepEqual(errors, []);
});
