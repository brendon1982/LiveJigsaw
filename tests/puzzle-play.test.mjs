import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
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
  await waitForText('Classic · 8');
  return { page, canvas, waitForText, errors };
}

test('live pieces scroll, reflow, and snap to the pannable board', async (t) => {
  const { page, canvas, waitForText, errors } = await openPuzzle(t, { viewport: { width: 1320, height: 780 } });
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

  await click(340, 361);
  await waitForText('0 of 8 placed');
  await waitForText('Drag to pan · Scroll to zoom');
  const initial = await canvas.screenshot();
  const sky = [192, 221, 219, 255];
  const guide = await pixelAt(page, initial, 542, 376);
  assert.ok(guide[0] > 25 && guide[0] < sky[0], 'The board should show the artwork at low opacity');
  assert.notDeepEqual(await pixelAt(page, initial, 199, 196), sky, 'The tray should start with one column');
  await move(85, 196);
  await page.mouse.wheel(0, 475);
  const scrolled = await canvas.screenshot();
  assert.notDeepEqual(await pixelAt(page, scrolled, 85, 196), await pixelAt(page, initial, 85, 196));
  await page.mouse.wheel(0, -1000);
  await drag(167, 320, 552, 320);
  const widened = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, widened, 427, 196), sky, 'Widening the tray should reveal another column');
  const boardSeam = await pixelAt(page, widened, 798, 330);
  assert.deepEqual(boardSeam, guide, 'The faint guide should be continuous across piece boundaries');
  await drag(427, 196, 600, 110);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 427, 196), sky, 'An invalid drop should return to the tray');
  await move(427, 196);
  await page.mouse.down();
  await move(735, 376, 8);
  const beforeZoom = await canvas.screenshot();
  await page.mouse.wheel(0, -200);
  const zoomed = await canvas.screenshot();
  const panelBackground = [25, 46, 40, 255];
  assert.deepEqual(await pixelAt(page, beforeZoom, 650, 500), panelBackground);
  assert.notDeepEqual(await pixelAt(page, zoomed, 650, 500), panelBackground, 'The wheel should enlarge the board');
  assert.notDeepEqual(await pixelAt(page, beforeZoom, 815, 366), sky);
  assert.deepEqual(await pixelAt(page, zoomed, 815, 366), sky, 'A piece in hand should scale with the board');
  await page.mouse.up();
  await waitForText('1 of 8 placed');
  const placed = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, placed, 735, 376), sky, 'Zooming at the drop target should keep it under the pointer');
  await page.mouse.wheel(0, 200);
  await drag(199, 309, 863, 376);
  await waitForText('2 of 8 placed');
  const joined = await canvas.screenshot();
  for (const [x, y] of [[798, 365], [802, 367], [811, 370], [815, 376], [809, 385]]) {
    assert.deepEqual(await pixelAt(page, joined, x, y), sky, 'The live guide should not show through joined pieces');
  }

  const assertCornerAtCenter = async (horizontal, vertical) => {
    const screenshot = await canvas.screenshot();
    assert.notDeepEqual(await pixelAt(page, screenshot, 927 + 14 * horizontal, 448 + 14 * vertical), panelBackground);
    assert.deepEqual(await pixelAt(page, screenshot, 927 - 14 * horizontal, 448 - 14 * vertical), panelBackground);
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
  await waitForText('Classic · 8');
  await click(1160, 361);
  await waitForText('0 of 32 placed');
  await drag(167, 320, 552, 320);
  const largeBefore = await canvas.screenshot();
  await drag(900, 350, 800, 270);
  const largeAfter = await canvas.screenshot();
  const tower = await pixelAt(page, largeBefore, 1124, 520);
  assert.notDeepEqual(await pixelAt(page, largeAfter, 1124, 520), tower);
  assert.deepEqual(await pixelAt(page, largeAfter, 1024, 440), tower, 'Large artwork should move with both pan axes');
  await drag(313, 447, 635, 296);
  await waitForText('1 of 32 placed');

  await page.setViewportSize({ width: 900, height: 620 });
  await page.waitForFunction(() => document.querySelector('canvas').width === 900);
  await page.evaluate(() => { window.paintedText = []; });
  await click(99, 43);
  await waitForText('Classic · 8');
  await click(460, 361);
  await waitForText('0 of 8 placed');
  const replay = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, replay, 85, 196), sky);
  assert.notDeepEqual(await pixelAt(page, initial, 85, 196), sky, 'Reopening the same puzzle should shuffle the tray again');
  assert.deepEqual(errors, []);
});

test('the four new artwork scenes animate on the board', async (t) => {
  const { page, waitForText, errors } = await openPuzzle(t, { viewport: { width: 1320, height: 780 } });
  const selections = [
    { title: 'Mountains', x: 340, y: 529, scroll: 320 },
    { title: 'Meadow', x: 1003, y: 529, scroll: 320 },
    { title: 'Desert', x: 340, y: 717, scroll: 1000 },
    { title: 'Forest', x: 1003, y: 717, scroll: 1000 },
  ];
  const board = { x: 435, y: 275, width: 590, height: 320 };

  for (const { title, x, y, scroll } of selections) {
    await page.mouse.move(340, 300);
    await page.mouse.wheel(0, scroll);
    await page.evaluate(() => { window.paintedText = []; });
    await page.mouse.click(x, y);
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
    await waitForText('Classic · 8');
  }
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
    const { page, canvas, waitForText, errors } = await openPuzzle(t, { viewport: { width: 1320, height: 540 } }, path);
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
    await page.mouse.click(340, 477);
    await waitForText('0 of 8 placed');
    assert.deepEqual(errors, []);
  });

  await t.test('touch can start scrolling on a card button and tap the third card', async (t) => {
    const { page, canvas, waitForText, errors } = await openPuzzle(t, {
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
    await swipeUp(400, 367, 145);
    assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 140, 160), await pixelAt(page, initial, 140, 160));
    assert.equal(await page.evaluate(() => window.paintedText.includes('0 of 8 placed')), false, 'A swipe should not activate the button');
    await swipeUp(170, 700, 180);
    assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 140, 410), previewColor, 'A swipe should reveal the third card');
    await page.touchscreen.tap(400, 723);
    await waitForText('0 of 8 placed');
    assert.deepEqual(errors, []);
  });
});

test('tablet touch scrolls, resizes, zooms, cancels, and places pieces', async (t) => {
  const { page, canvas, waitForText, errors } = await openPuzzle(t, {
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

  await page.touchscreen.tap(522, 367);
  await waitForText('0 of 8 placed');
  await waitForText('Drag to pan · Pinch to zoom');
  const startingPiece = await pixelAt(page, await canvas.screenshot(), 85, 196);
  await moveFinger(85, 310, 85, 196);
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 85, 196), startingPiece, 'A swipe starting on a piece should scroll');
  await moveFinger(85, 196, 85, 310);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 85, 196), startingPiece);
  await moveFinger(167, 340, 450, 340);
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 199, 196), [48, 72, 65, 255], 'The touch divider should reflow the tray');

  const panelBackground = [25, 46, 40, 255];
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 900, 244), panelBackground);
  await dispatch('touchStart', [530, 400]);
  await dispatch('touchStart', [530, 400], [650, 400]);
  await dispatch('touchMove', [500, 400], [680, 400]);
  await dispatch('touchEnd');
  assert.notDeepEqual(await pixelAt(page, await canvas.screenshot(), 900, 255), panelBackground, 'A pinch should enlarge the board artwork');

  await moveFinger(85, 309, 508, 355, 'touchCancel');
  assert.equal(await page.evaluate(() => window.paintedText.includes('1 of 8 placed')), false, 'A cancelled touch should not place a piece');
  await dispatch('touchStart', [85, 309]);
  await dispatch('touchMove', [55, 309]);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 140, 309), [48, 72, 65, 255],
    'A leftward move should leave the piece in the tray');
  await dispatch('touchEnd');
  await dispatch('touchStart', [85, 309]);
  await dispatch('touchMove', [85, 321]);
  await dispatch('touchMove', [99, 344]);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 145, 341), [192, 221, 219, 255],
    'A rightward drag near 70° should lift the piece after a small vertical start');
  await dispatch('touchMove', [508, 355]);
  await dispatch('touchEnd');
  await waitForText('1 of 8 placed');
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 508, 355), [192, 221, 219, 255], 'A touch drop should snap at the zoomed target');
  await moveFinger(700, 500, 850, 500);
  const panned = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, panned, 508, 355), panelBackground, 'One finger should pan the zoomed board');
  assert.deepEqual(await pixelAt(page, panned, 658, 355), [192, 221, 219, 255], 'Placed pieces should follow the pan');

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => document.querySelector('canvas').height === 1024);
  await page.evaluate(() => { window.paintedText = []; });
  await page.touchscreen.tap(99, 43);
  await waitForText('Classic · 8');
  await page.touchscreen.tap(395, 367);
  await waitForText('0 of 8 placed');
  assert.deepEqual(errors, []);
});
