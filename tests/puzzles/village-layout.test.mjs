import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bladePadding, cellSize, generateVillage } from '../../src/puzzles/medievalVillage/villageLayout.ts';

const atlas = readFileSync(new URL(
  '../../src/puzzles/medievalVillage/assets/medievalRTS_spritesheet@2.xml', import.meta.url,
), 'utf8');
const structures = new Map([...atlas.matchAll(/medievalStructure_(\d+)\.png"[^>]*width="(\d+)" height="(\d+)"/g)]
  .map(([, frame, width, height]) => [Number(frame), { width: Number(width), height: Number(height) }]));
const villageSize = { width: 512, height: 288 };
const columns = villageSize.width / cellSize;
const rows = villageSize.height / cellSize;
const roadFrames = [0, 34, 33, 31, 35, 3, 17, 21, 19, 32, 4, 7, 18, 20, 6, 5];
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const layout = (seed, viewport = villageSize) => generateVillage(viewport, seed, (frame) => structures.get(frame));

test('a village seed reproduces the developed terrain and walks', () => {
  const fullHD = { width: 1920, height: 1080 };
  assert.deepEqual(layout(1_011_889, fullHD), layout(1_011_889, fullHD));
});

function roadMask({ frame, road }) {
  return roadFrames.indexOf(road ? road.frame - 5 : frame);
}

function checkRoadNetwork(roads, columns, rows) {
  const pending = [roads.keys().next().value];
  const visited = new Set(pending);
  const approaches = [];
  for (const id of pending) {
    const mask = roads.get(id);
    directions.forEach(([dx, dy], direction) => {
      if (!(mask & (1 << direction))) return;
      const x = id % columns + dx;
      const y = Math.floor(id / columns) + dy;
      if (x < 0 || x >= columns || y < 0 || y >= rows) {
        approaches.push(direction);
        return;
      }
      const neighbor = y * columns + x;
      assert.ok(roads.get(neighbor) & (1 << ((direction + 2) % 4)), `Road ends at cell ${id}`);
      if (visited.has(neighbor)) return;
      visited.add(neighbor);
      pending.push(neighbor);
    });
  }
  assert.equal(visited.size, roads.size);
  assert.equal(approaches.length, 2);
  return approaches;
}

test('terrain-first villages vary while keeping their farms, roads and walks usable', () => {
  const approachSides = new Set();
  const farmLocations = new Set();
  let branched = 0;
  for (let index = 0; index < 64; index += 1) {
    const seed = Math.imul(index, 0x9e3779b9) >>> 0;
    const { ground, props, mills: [mill], walks } = layout(seed);
    const roads = new Map();
    const fields = [];
    ground.forEach((tile, id) => {
      const mask = roadMask(tile);
      if (mask > 0) roads.set(id, mask);
      if (tile.frame >= 53 && tile.frame <= 56) fields.push(id);
    });
    assert.equal(ground.length, columns * rows);
    assert.equal(fields.length, 4, `Seed ${seed} should have four field tiles`);
    assert.deepEqual(fields, [fields[0], fields[0] + 1, fields[0] + columns, fields[0] + columns + 1]);
    assert.ok(fields.every((id) => !roads.has(id)));
    assert.ok(ground.some(({ frame }) => frame >= 41 && frame <= 48), `Seed ${seed} should keep woodland`);
    farmLocations.add(fields[0]);

    for (const direction of checkRoadNetwork(roads, columns, rows)) approachSides.add(direction);
    if ([...roads.values()].some((mask) => [7, 11, 13, 14].includes(mask))) branched += 1;

    const buildings = props.filter(({ kind }) => kind === 'Structure');
    assert.ok(buildings.length >= 6);
    assert.ok(buildings.some(({ x, y }) => x === mill.x && y === mill.y));
    const occupied = new Set([...roads.keys(), ...fields]);
    const blade = structures.get(mill.blades);
    const radius = Math.hypot(blade.width + 2 * bladePadding, blade.height + 2 * bladePadding) * mill.bladeScale / 2;
    const hubY = mill.y - mill.hub;
    assert.ok(mill.x - radius >= 0 && mill.x + radius <= villageSize.width);
    assert.ok(hubY - radius >= 0 && hubY + radius <= villageSize.height);
    for (let row = Math.floor((hubY - radius) / cellSize); row < Math.ceil((hubY + radius) / cellSize); row += 1) {
      for (let column = Math.floor((mill.x - radius) / cellSize); column < Math.ceil((mill.x + radius) / cellSize); column += 1) {
        assert.ok(!occupied.has(row * columns + column), `Seed ${seed} has roads or fields under the blades`);
      }
    }
    for (const { x, y, frames, scale } of buildings) {
      const sizes = frames.map((frame) => structures.get(frame));
      const halfWidth = Math.max(...sizes.map(({ width }) => width)) * scale / 2;
      const height = sizes.reduce((sum, size) => sum + size.height, 0) * scale;
      assert.ok(x - halfWidth >= 0 && x + halfWidth <= villageSize.width);
      assert.ok(y - height >= 0 && y <= villageSize.height);
      for (let row = Math.floor((y - height) / cellSize); row < Math.ceil(y / cellSize); row += 1) {
        for (let column = Math.floor((x - halfWidth) / cellSize); column < Math.ceil((x + halfWidth) / cellSize); column += 1) {
          const id = row * columns + column;
          assert.ok(!occupied.has(id), `Seed ${seed} has an overlapping building at cell ${id}`);
          occupied.add(id);
        }
      }
    }
    assert.ok(walks.length >= 5);
    for (const walk of walks) {
      assert.equal(new Set(walk.stops).size, 3);
      assert.ok(walk.stops.every((id) => roads.has(id)));
      assert.ok(Number.isFinite(walk.duration) && walk.duration > 0);
    }
  }
  assert.equal(approachSides.size, 4);
  assert.ok(branched > 10 && branched < 54);
  assert.ok(farmLocations.size > 20);
});

test('larger villages add developed areas and walks along one continuous native-size grid', () => {
  const sizes = [{ width: 1024, height: 576 }, { width: 1920, height: 1080 }, { width: 2561, height: 1441 }];
  for (const seed of [0, 17, 233, 1_011_889, 0xffffffff]) {
    let previous = [0, 0, 0, 0];
    for (const viewport of sizes) {
      const { columns, origin, ground, props, mills, walks } = layout(seed, viewport);
      const rows = Math.ceil(viewport.height / cellSize);
      assert.equal(columns, Math.ceil(viewport.width / cellSize));
      assert.deepEqual(origin, { x: 0, y: 0 });
      assert.equal(ground.filter(Boolean).length, columns * rows);
      const roads = new Map(ground.map((tile, id) => [id, roadMask(tile)]).filter(([, mask]) => mask > 0));
      checkRoadNetwork(roads, columns, rows);
      const fields = ground.filter(({ frame }) => frame === 55 || frame === 56).length;
      assert.equal(fields, mills.length * 4);
      const woods = ground.filter(({ frame }) => frame >= 41 && frame <= 48).length;
      const buildings = props.filter(({ kind }) => kind === 'Structure');
      assert.ok(buildings.length >= mills.length * 6);
      assert.ok(buildings.every(({ scale }) => scale <= 0.45));
      assert.ok(walks.length >= mills.length * 5);
      for (const walk of walks) {
        assert.ok(walk.stops.every((id) => roads.has(id)));
        for (const { from, to } of walk.steps) {
          for (const { x, y } of [from, to]) assert.ok(roads.has(Math.floor(y / cellSize) * columns + Math.floor(x / cellSize)));
        }
      }
      const counts = [fields, woods, buildings.length, walks.length];
      assert.ok(counts.every((count, index) => count > previous[index]));
      previous = counts;
    }
  }
});
