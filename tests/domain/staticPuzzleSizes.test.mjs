import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPieceCount, pieceShapes, puzzleSizePresets } from '../../src/domain/puzzleSizes.ts';
import { maximumPuzzlePieceCount, staticPuzzleSizes } from '../../src/domain/staticPuzzleSizes.ts';
import { puzzleSizeChoices } from '../../src/puzzles/puzzleSizeChoices.ts';

test('static artwork follows the square preset areas without changing proportions or depending on piece shape', () => {
  for (const artwork of [{ width: 2000, height: 2834 }, { width: 4000, height: 1000 }]) {
    const choices = staticPuzzleSizes(artwork);
    assert.equal(choices.length, puzzleSizePresets.length);
    for (const [index, { preset }] of choices.entries()) {
      const target = puzzleSizePresets[index].square;
      const { width, height } = preset.square;
      assert.ok(Number.isInteger(width) && Number.isInteger(height));
      assert.ok(width < artwork.width && height < artwork.height);
      assert.ok(Math.abs(width * height / (target.width * target.height) - 1) < 0.003);
      assert.ok(Math.abs(width / height / (artwork.width / artwork.height) - 1) < 0.003);
      for (const size of Object.values(preset)) {
        assert.deepEqual([size.width, size.height], [width, height]);
      }
    }
  }
});

test('static shape choices stay within 20% of the target', () => {
  const choices = staticPuzzleSizes({ width: 1200, height: 1897 });
  assert.deepEqual(choices.map(({ targetCount }) => targetCount), [40, 72, 144, 300, 420]);
  for (const { targetCount, preset } of choices) {
    for (const [shape, size] of Object.entries(preset)) {
      assert.ok(Math.abs(getPieceCount(size) - targetCount) <= targetCount * 0.2);
      const aspect = (size.width / size.columns) / (size.height / size.rows);
      const ideal = pieceShapes[shape].width / pieceShapes[shape].height;
      assert.ok(Math.abs(aspect / ideal - 1) < 0.08, `${targetCount} ${shape}`);
    }
  }
  assert.equal(getPieceCount(choices.at(-1).preset.square), 459);
  assert.equal(maximumPuzzlePieceCount, 504);
});

test('square pieces favor the best proportions, breaking ties by distance from the target', () => {
  const panorama = { width: 400, height: 100 };
  const [small, medium] = staticPuzzleSizes(panorama);
  assert.deepEqual([small.preset.square.columns, small.preset.square.rows], [12, 3]);
  assert.equal(getPieceCount(medium.preset.square), 64);

  const last = staticPuzzleSizes({ width: 1400, height: 900 }).at(-1).preset.square;
  assert.equal(getPieceCount(last), maximumPuzzlePieceCount);
});

test('small images are not enlarged to reach the target area or to offer a cut', () => {
  const small = staticPuzzleSizes({ width: 400, height: 100 });
  assert.equal(small.length, puzzleSizePresets.length);
  for (const { preset } of small) {
    assert.deepEqual([preset.square.width, preset.square.height], [400, 100]);
  }
  const [only] = staticPuzzleSizes({ width: 5, height: 7 });
  assert.equal(only.targetCount, 40);
  assert.ok(Object.values(only.preset).every(({ columns, rows }) => columns <= 5 && rows <= 7));
  assert.deepEqual(staticPuzzleSizes({ width: 5, height: 6 }), []);
});

test('animated sources use only the original fixed viewports and exact counts', () => {
  const choices = puzzleSizeChoices({ motion: 'Animated', maxViewport: { width: 1920, height: 1020 } });
  assert.deepEqual(choices.map(({ preset }) => preset), puzzleSizePresets);
  assert.ok(choices.every(({ targetCount, preset }) => Object.values(preset).every((size) => getPieceCount(size) === targetCount)));
  assert.deepEqual(puzzleSizeChoices({ motion: 'Animated', maxViewport: { width: 400, height: 100 } }), []);
});