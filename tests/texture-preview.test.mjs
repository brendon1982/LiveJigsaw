import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { newClassicPuzzle } from '../src/domain/classicPuzzle.ts';
import { arrangeTray, boardBounds, gameHeight, gameWidth, previewBounds, traySlotCenter } from '../src/ui/playLayout.ts';

const sky = [192, 221, 219, 255];
const night = [38, 54, 77, 255];
const background = [38, 58, 54, 255];

async function samplePixels(page, screenshot, x, y, columns = 1, rows = 1) {
  return page.evaluate(async ({ png, x, y, width, height, columns, rows }) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + png;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = columns;
    canvas.height = rows;
    const context = canvas.getContext('2d');
    context.drawImage(image, Math.floor(image.width * x / width), Math.floor(image.height * y / height),
      columns, rows, 0, 0, columns, rows);
    return Array.from(context.getImageData(0, 0, columns, rows).data);
  }, { png: screenshot.toString('base64'), x, y, width: gameWidth, height: gameHeight, columns, rows });
}

test('the RexUI picker launches either live puzzle and the host compares both rendering paths', async (t) => {
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
  await canvas.waitFor();
  const bounds = await canvas.boundingBox();
  const screenX = (x) => bounds.x + x * bounds.width / gameWidth;
  const screenY = (y) => bounds.y + y * bounds.height / gameHeight;
  const click = async (worldX, worldY) => {
    await page.mouse.click(screenX(worldX), screenY(worldY));
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  };
  const waitForText = (text) => page.waitForFunction((value) => window.paintedText.includes(value), text);
  const classic = newClassicPuzzle();
  const topLeft = classic.pieces[0];
  const tray = arrangeTray(classic.pieces);
  const home = traySlotCenter(tray.indexOf(topLeft));
  const target = { x: boardBounds.x + topLeft.target.x, y: boardBounds.y + topLeft.target.y };
  const previewPixel = (frame, x, y, columns, rows) =>
    samplePixels(page, frame, previewBounds.x + x, previewBounds.y + y, columns, rows);
  const placeTopLeft = async () => {
    await page.mouse.move(screenX(home.x), screenY(home.y));
    await page.mouse.down();
    await page.mouse.move(screenX(target.x), screenY(target.y), { steps: 8 });
    await page.mouse.up();
    await waitForText(`Drag the pieces onto the board. 1 of ${classic.pieces.length} placed.`);
  };

  await waitForText('Choose a live puzzle');
  const picker = await canvas.screenshot();
  assert.deepEqual(await samplePixels(page, picker, 328, 181), sky);
  assert.deepEqual(await samplePixels(page, picker, 920, 181), night);
  assert.equal(await page.locator('button, select').count(), 0);

  await click(328, 473);
  await waitForText(`Drag the pieces onto the board. 0 of ${classic.pieces.length} placed.`);
  const puzzle = await canvas.screenshot();
  const firstSlot = traySlotCenter(0);
  assert.notDeepEqual(await samplePixels(page, puzzle, firstSlot.x, firstSlot.y), background);
  assert.deepEqual(await samplePixels(page, puzzle, home.x, home.y), sky, 'The top-left piece should show its own region');

  await click(219, 97);
  const texture = await canvas.screenshot();
  assert.deepEqual(await previewPixel(texture, 256, 29), sky);
  const sunEdge = await previewPixel(texture, 364, 49, 12, 12);
  assert.ok(sunEdge.some((red, channel) => channel % 4 === 0 && red > 192 && red < 253),
    'The textured sun should blend into the sky at its edge');
  assert.notDeepEqual(await canvas.screenshot(), texture, 'The textured windmill should animate');

  await click(390, 97);
  const direct = await canvas.screenshot();
  assert.deepEqual(await previewPixel(direct, 256, 29), sky);
  assert.notDeepEqual(await canvas.screenshot(), direct, 'The direct windmill should animate');

  await click(74, 97);
  await placeTopLeft();
  await click(390, 97);
  await click(74, 97);
  const resumed = await canvas.screenshot();
  assert.deepEqual(await samplePixels(page, resumed, target.x, target.y), sky, 'Placed pieces should survive view changes');

  await click(99, 43);
  await click(920, 473);
  const lighthouse = await canvas.screenshot();
  assert.deepEqual(await samplePixels(page, lighthouse, home.x, home.y), night, 'Lighthouse pieces should use the new source');
  await click(219, 97);
  const lighthouseTexture = await canvas.screenshot();
  assert.deepEqual(await previewPixel(lighthouseTexture, 256, 29), night);
  assert.notDeepEqual(await canvas.screenshot(), lighthouseTexture, 'The lighthouse should animate');
  await click(390, 97);
  assert.deepEqual(await previewPixel(await canvas.screenshot(), 256, 29), night);
  await click(99, 43);
  await click(328, 473);
  assert.deepEqual(await samplePixels(page, await canvas.screenshot(), home.x, home.y), sky, 'Windmill should open again with fresh pieces');
  assert.deepEqual(errors, []);
});
