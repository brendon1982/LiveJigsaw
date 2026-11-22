import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

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

test('live pieces scroll, reflow, and snap to the pannable board', async (t) => {
  const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
  t.after(() => server.close());
  const { port } = server.httpServer.address();
  const browser = await chromium.launch({
    channel: process.env.LIVE_JIGSAW_BROWSER ?? 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1320, height: 780 } });
  await page.addInitScript(() => {
    window.paintedText = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      window.paintedText.push(text);
      return fillText.call(this, text, ...args);
    };
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + port);
  const canvas = page.locator('#game canvas');
  const waitForText = (text) => page.waitForFunction((value) => window.paintedText.includes(value), text, { timeout: 4000 });
  await waitForText('Choose a live puzzle');
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

  await click(387, 593);
  await waitForText('0 of 8 placed');
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
  const trayEdge = await pixelAt(page, widened, 427, 153);
  assert.ok(trayEdge[0] >= 186 && trayEdge[2] >= 190 && trayEdge[2] < 215, 'The tray piece should have a light edge');
  const boardSeam = await pixelAt(page, widened, 798, 330);
  assert.ok(boardSeam[0] > guide[0] + 20, 'The guide should show the piece seams');
  await drag(427, 196, 600, 110);
  assert.deepEqual(await pixelAt(page, await canvas.screenshot(), 427, 196), sky, 'An invalid drop should return to the tray');
  await drag(427, 196, 735, 376);
  await waitForText('1 of 8 placed');
  const placed = await canvas.screenshot();
  assert.deepEqual(await pixelAt(page, placed, 735, 376), sky, 'Placed artwork should be opaque');
  const placedEdge = await pixelAt(page, placed, 735, 304);
  assert.ok(placedEdge[0] >= 186 && placedEdge[2] >= 190 && placedEdge[2] < 215, 'The placed piece should keep its outline');

  const panelBackground = [25, 46, 40, 255];
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
  await waitForText('Choose a live puzzle');
  await click(1137, 593);
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
  await waitForText('Choose a live puzzle');
  const pickerZoom = 900 / 1248;
  const pickerTop = Math.floor((620 - Math.floor(540 * pickerZoom)) / 2);
  await click(351 * pickerZoom, pickerTop + 473 * pickerZoom);
  await waitForText('0 of 8 placed');
  assert.deepEqual(errors, []);
});
