import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const width = 1248;
const height = 540;
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
  }, { png: screenshot.toString('base64'), x, y, width, height, columns, rows });
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
  const { x, y } = await canvas.boundingBox();
  const click = async (worldX, worldY) => {
    await page.mouse.click(x + worldX, y + worldY);
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  };
  const waitForText = (text) => page.waitForFunction((value) => window.paintedText.includes(value), text);
  const solve = async () => {
    const order = [5, 2, 7, 0, 3, 6, 1, 4];
    for (const [slot, index] of order.entries()) {
      await page.mouse.move(x + 552 + (slot % 4 + 0.5) * 170, y + 144 + (Math.floor(slot / 4) + 0.5) * 186);
      await page.mouse.down();
      await page.mouse.move(x + 16 + (index % 4 + 0.5) * 128, y + 164 + (Math.floor(index / 4) + 0.5) * 144, { steps: 8 });
      await page.mouse.up();
    }
    await waitForText('Puzzle complete');
  };

  await waitForText('Choose a live puzzle');
  const picker = await canvas.screenshot();
  assert.deepEqual(await samplePixels(page, picker, 328, 181), sky);
  assert.deepEqual(await samplePixels(page, picker, 920, 181), night);
  assert.equal(await page.locator('button, select').count(), 0);

  await click(328, 473);
  await waitForText('Drag the pieces onto the board. 0 of 8 placed.');
  const puzzle = await canvas.screenshot();
  assert.deepEqual(await samplePixels(page, puzzle, 565, 187), background);
  assert.notDeepEqual(await samplePixels(page, puzzle, 637, 237), background);
  assert.deepEqual(await samplePixels(page, puzzle, 1147, 237), sky, 'The top-left piece should show its own region');

  await click(219, 97);
  const texture = await canvas.screenshot();
  assert.deepEqual(await samplePixels(page, texture, 368 + 256, 190 + 29), sky);
  const sunEdge = await samplePixels(page, texture, 368 + 364, 190 + 49, 12, 12);
  assert.ok(sunEdge.some((red, channel) => channel % 4 === 0 && red > 192 && red < 253),
    'The textured sun should blend into the sky at its edge');
  assert.notDeepEqual(await canvas.screenshot(), texture, 'The textured windmill should animate');

  await click(390, 97);
  const direct = await canvas.screenshot();
  assert.deepEqual(await samplePixels(page, direct, 368 + 256, 190 + 29), sky);
  assert.notDeepEqual(await canvas.screenshot(), direct, 'The direct windmill should animate');

  await click(74, 97);
  await solve();
  await click(390, 97);
  await click(74, 97);
  const solved = await canvas.screenshot();
  assert.deepEqual(await samplePixels(page, solved, 16 + 260, 164 + 29), sky, 'The solved board should survive view changes');

  await click(99, 43);
  await click(920, 473);
  const lighthouse = await canvas.screenshot();
  assert.deepEqual(await samplePixels(page, lighthouse, 1147, 237), night, 'Lighthouse pieces should use the new source');
  await click(219, 97);
  const lighthouseTexture = await canvas.screenshot();
  assert.deepEqual(await samplePixels(page, lighthouseTexture, 368 + 256, 190 + 29), night);
  assert.notDeepEqual(await canvas.screenshot(), lighthouseTexture, 'The lighthouse should animate');
  await click(390, 97);
  assert.deepEqual(await samplePixels(page, await canvas.screenshot(), 368 + 256, 190 + 29), night);
  await click(74, 97);
  await page.evaluate(() => { window.paintedText = []; });
  await solve();
  assert.deepEqual(await samplePixels(page, await canvas.screenshot(), 16 + 260, 164 + 29), night);
  await click(99, 43);
  await click(328, 473);
  assert.deepEqual(await samplePixels(page, await canvas.screenshot(), 1147, 237), sky, 'Windmill should open again with fresh pieces');
  assert.deepEqual(errors, []);
});
