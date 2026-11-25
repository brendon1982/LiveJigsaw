import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { seededRandom } from '../../src/domain/seededRandom.ts';
import { scatterHexScenery } from '../../src/puzzles/hexCoast/hexCoastScenery.ts';

const frames = Object.fromEntries(['details', 'trees'].map((sheet) => {
  const atlas = readFileSync(new URL(`../../src/puzzles/hexCoast/assets/${sheet}.xml`, import.meta.url), 'utf8');
  return [sheet, new Set([...atlas.matchAll(/name="([^"]+)\.png"/g)].map(([, name]) => name))];
}));

test('every land biome can use all grass, flower, and boulder colors within the hex face', () => {
  const palettes = ['bush', 'flower', 'smallRock', 'hill'];
  for (const biome of ['grass', 'autumn', 'sand', 'rock', 'snow']) {
    const used = new Set();
    for (let seed = 0; seed < 256; seed += 1) {
      for (const { x, y, radius, frame, sheet } of scatterHexScenery({ biome, wooded: false }, seededRandom(seed))) {
        assert.ok(frames[sheet].has(frame), frame);
        assert.ok(Math.abs(x) + radius < 32);
        assert.ok(Math.abs(y) + radius * 0.6 + (Math.abs(x) + radius) / 2 < 32);
        if (sheet === 'details') used.add(frame);
      }
    }
    assert.deepEqual(used, new Set([...frames.details].filter((frame) => palettes.some((prefix) => frame.startsWith(prefix)))),
      biome);
  }
});

test('woodland varies the number and positions of trees and flowers without crowding their bases', () => {
  const flowerCounts = new Set();
  const treeCounts = new Set();
  const treeLocations = new Set();
  let mixedBouquet = false;
  for (let seed = 0; seed < 64; seed += 1) {
    const sprites = scatterHexScenery({ biome: 'grass', wooded: true }, seededRandom(seed));
    const trees = sprites.filter(({ sheet }) => sheet === 'trees');
    const flowers = sprites.filter(({ frame }) => frame.startsWith('flower'));
    treeCounts.add(trees.length);
    flowerCounts.add(flowers.length);
    mixedBouquet ||= new Set(flowers.map(({ frame }) => frame)).size > 1;
    for (const { x, y } of trees) treeLocations.add(`${Math.round(x)},${Math.round(y)}`);
    sprites.forEach((sprite, index) => {
      for (const other of sprites.slice(index + 1)) {
        const distance = Math.hypot(sprite.x - other.x, (sprite.y - other.y) * 1.35);
        assert.ok(distance >= sprite.radius + other.radius);
      }
    });
  }
  assert.ok(treeCounts.has(0) && treeCounts.has(1) && treeCounts.has(3));
  assert.ok(flowerCounts.has(0) && flowerCounts.has(1) && flowerCounts.has(3));
  assert.ok(treeLocations.size > 30);
  assert.ok(mixedBouquet);
});
