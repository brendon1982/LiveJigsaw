import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { PNG } from 'pngjs';
import { prepareAtlas } from '../../scripts/prepare-atlas.mjs';

const assetRoot = new URL('../../src/puzzles/', import.meta.url);

function framesIn(xml) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(document.getElementsByTagName('SubTexture'), (element) => {
    const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((key) => Number(element.getAttribute(key)));
    return { name: element.getAttribute('name'), x, y, width, height };
  });
}

function rgba(image, x, y) {
  return image.data.readUInt32BE((y * image.width + x) * 4);
}

function checkPadding(image, frames) {
  for (const { name, x, y, width, height } of frames) {
    assert.ok(x >= 2 && y >= 2 && x + width + 2 <= image.width && y + height + 2 <= image.height, name);
    for (let row = -2; row < height + 2; row += 1) {
      for (let column = -2; column < width + 2; column += 1) {
        if (column >= 0 && column < width && row >= 0 && row < height) continue;
        const edgeX = x + Math.min(Math.max(column, 0), width - 1);
        const edgeY = y + Math.min(Math.max(row, 0), height - 1);
        assert.equal(rgba(image, x + column, y + row), rgba(image, edgeX, edgeY), `${name} at ${column}, ${row}`);
      }
    }
  }
}

test('atlas preparation preserves frame pixels and metadata and can be repeated', () => {
  const source = new PNG({ width: 3, height: 2 });
  source.data.set([
    22, 45, 98, 255, 200, 10, 20, 0, 151, 93, 62, 255,
    14, 87, 65, 255, 41, 57, 98, 90, 214, 178, 30, 255,
  ]);
  const xml = `<TextureAtlas imagePath="input.png">
    <SubTexture name="ground.png" x="0" y="0" width="2" height="2"/>
    <SubTexture name="tree.png" x="2" y="0" width="1" height="2" frameX="-3" frameY="-4" frameWidth="7" frameHeight="9"/>
    </TextureAtlas>`;

  const output = prepareAtlas(PNG.sync.write(source), xml, 'output.png');
  const image = PNG.sync.read(output.png);
  const frames = framesIn(output.xml);
  assert.match(output.xml, /imagePath="output\.png"/);
  assert.match(output.xml, /frameX="-3" frameY="-4" frameWidth="7" frameHeight="9"/);
  assert.deepEqual(frames.map(({ name, width, height }) => ({ name, width, height })),
    [{ name: 'ground.png', width: 2, height: 2 }, { name: 'tree.png', width: 1, height: 2 }]);
  framesIn(xml).forEach((original, index) => {
    const moved = frames[index];
    for (let row = 0; row < original.height; row += 1) {
      for (let column = 0; column < original.width; column += 1) {
        assert.equal(rgba(image, moved.x + column, moved.y + row), rgba(source, original.x + column, original.y + row));
      }
    }
  });
  checkPadding(image, frames);
  assert.deepEqual(prepareAtlas(output.png, output.xml, 'output.png'), output);
});

test('both tileset puzzles ship atlases with padded frame edges', () => {
  for (const base of [
    'medievalVillage/assets/medievalRTS_spritesheet@2',
    ...['fullTiles', 'details', 'trees', 'buildings'].map((sheet) => `hexCoast/assets/${sheet}`),
  ]) {
    const xml = readFileSync(new URL(`${base}.xml`, assetRoot), 'utf8');
    const image = PNG.sync.read(readFileSync(new URL(`${base}.png`, assetRoot)));
    const frames = framesIn(xml);
    assert.ok(frames.length > 0, base);
    checkPadding(image, frames);
  }
});
