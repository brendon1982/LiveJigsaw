import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { generateHexCoast } from '../../src/puzzles/hexCoast/hexCoastLayout.ts';

const buildingAtlas = readFileSync(new URL(
  '../../src/puzzles/hexCoast/assets/buildings.xml', import.meta.url,
), 'utf8');
const buildingFrames = new Set([...buildingAtlas.matchAll(/name="([^"]+)\.png"/g)].map(([, name]) => name));
const standard = { width: 1024, height: 576 };
const fullHD = { width: 1920, height: 1080 };

function adjacent(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx === 64 && dy === 0) || (dx === 32 && dy === 48);
}

test('Hex Coast recreates the terrain and settlements from its seed', () => {
  assert.deepEqual(generateHexCoast(fullHD, 0xffffffff), generateHexCoast(fullHD, 0xffffffff));
});

test('Hex Coast lays connected roads and two sets of roadside buildings across varied landscapes', () => {
  const shorelines = new Set();
  for (let index = 0; index < 64; index += 1) {
    const seed = Math.imul(index, 0x9e3779b9) >>> 0;
    const { tiles, roads: [road], towns, buildings } = generateHexCoast(standard, seed);
    shorelines.add(tiles.map(({ level }) => level ? '1' : '0').join(''));
    assert.ok(tiles.some(({ wooded }) => wooded), `Seed ${seed} should have woodland`);
    const [harbor, village] = towns;
    assert.ok(tiles.some((tile) => tile.level === 0 && adjacent(tile, tiles[harbor])));
    assert.equal(road[0], harbor);
    assert.equal(road.at(-1), village);
    assert.equal(new Set(road).size, road.length);
    road.forEach((id, index) => {
      assert.equal(tiles[id].level, 1);
      if (index) assert.ok(adjacent(tiles[id], tiles[road[index - 1]]));
    });
    assert.ok(buildings.size >= 8);
    assert.equal([...buildings.values()].filter(({ floors }) => floors === 2).length, 2);
    for (const [id, { wall, upper, roof }] of buildings) {
      assert.equal(tiles[id].level, 1);
      assert.ok(!road.includes(id));
      assert.ok(road.some((section) => adjacent(tiles[id], tiles[section])));
      assert.ok([wall, upper, roof].every((frame) => buildingFrames.has(frame)));
    }
  }
  assert.ok(shorelines.size > 48);
});

test('larger coasts fill the viewport with native hexes and more developed shorelines', () => {
  const aboveFullHD = { width: 3100, height: 1760 };
  for (const seed of [0, 17, 233, 1_011_889, 0xffffffff]) {
    let previousRoads = 0;
    let previousLand = 0;
    for (const viewport of [standard, fullHD, aboveFullHD]) {
      const { tiles, roads, towns, buildings } = generateHexCoast(viewport, seed);
      assert.ok(roads.length > previousRoads);
      assert.equal(towns.length, roads.length * 2);
      assert.ok(buildings.size >= roads.length * 8);
      assert.equal(new Set(tiles.map(({ x, y }) => `${x},${y}`)).size, tiles.length);
      assert.ok(tiles.some(({ x }) => x >= viewport.width));
      assert.ok(tiles.some(({ y }) => y >= viewport.height));
      for (const road of roads) {
        assert.ok(tiles.some((tile) => !tile.level && adjacent(tile, tiles[road[0]])));
        for (let i = 1; i < road.length; i += 1) assert.ok(adjacent(tiles[road[i - 1]], tiles[road[i]]));
      }
      const land = tiles.filter(({ level }) => level > 0).length;
      assert.ok(land > previousLand && land / tiles.length > 0.24);
      previousRoads = roads.length;
      previousLand = land;
    }
  }
});
