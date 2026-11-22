import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

async function samplePixel(page, screenshot, x, y, width = 512, height = 288) {
  return page.evaluate(async ({ png, x, y, width, height }) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + png;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    context.drawImage(image, Math.floor(image.width * x / width), Math.floor(image.height * y / height), 1, 1, 0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  }, { png: screenshot.toString('base64'), x, y, width, height });
}

test('the host renders a live jigsaw and compares both source rendering paths', async (t) => {
  const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
  t.after(() => server.close());
  const { port } = server.httpServer.address();

  const browser = await chromium.launch({
    channel: process.env.LIVE_JIGSAW_BROWSER ?? 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1320, height: 780 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + port);

  const view = page.getByRole('combobox', { name: 'View' });
  const canvas = page.locator('#game canvas');
  const dimensions = page.getByText('512 × 288 px', { exact: true });
  const chooseView = async (mode) => {
    await view.selectOption(mode);
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  };
  await page.waitForFunction(() => document.querySelector('#render-view')?.disabled === false);
  assert.equal(await view.inputValue(), 'puzzle');
  const status = page.getByRole('status');
  assert.match(await status.textContent(), /0 of 8 placed/);
  const puzzle = await canvas.screenshot();
  assert.deepEqual(await samplePixel(page, puzzle, 565, 75, 1248, 420), [38, 58, 54, 255]);
  assert.notDeepEqual(await samplePixel(page, puzzle, 637, 125, 1248, 420), [38, 58, 54, 255]);

  await chooseView('texture');
  assert.equal(await dimensions.isVisible(), true);
  assert.equal(await status.isVisible(), false);
  const textureBounds = await canvas.boundingBox();
  const texture = await canvas.screenshot();
  assert.deepEqual(await samplePixel(page, texture, 256, 29), [192, 221, 219, 255]);
  assert.notDeepEqual(await canvas.screenshot(), texture, 'The textured windmill should animate');

  await chooseView('direct');
  assert.deepEqual(await canvas.boundingBox(), textureBounds);
  const direct = await canvas.screenshot();
  assert.deepEqual(await samplePixel(page, direct, 256, 29), [192, 221, 219, 255]);
  assert.notDeepEqual(await canvas.screenshot(), direct, 'The direct windmill should animate');

  await chooseView('puzzle');
  assert.equal(await dimensions.isVisible(), false);
  const { x, y } = await canvas.boundingBox();
  const order = [5, 2, 7, 0, 3, 6, 1, 4];
  for (const [slot, index] of order.entries()) {
    await page.mouse.move(x + 552 + (slot % 4 + 0.5) * 170, y + 32 + (Math.floor(slot / 4) + 0.5) * 186);
    await page.mouse.down();
    await page.mouse.move(x + 16 + (index % 4 + 0.5) * 128, y + 48 + (Math.floor(index / 4) + 0.5) * 144, { steps: 8 });
    await page.mouse.up();
  }
  assert.equal(await status.textContent(), 'Puzzle complete');
  const solved = await canvas.screenshot();
  assert.deepEqual(await samplePixel(page, solved, 16 + 256, 48 + 29, 1248, 420), [192, 221, 219, 255]);
  await chooseView('direct');
  await chooseView('puzzle');
  assert.equal(await status.textContent(), 'Puzzle complete');
  assert.deepEqual(errors, []);
});
