import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPieceCount, pieceShapes, puzzleSizePresets } from '../../src/domain/puzzleSizes.ts';
import { maximumPuzzlePieceCount, staticPuzzleSizes } from '../../src/domain/staticPuzzleSizes.ts';
import { puzzleSizeChoices } from '../../src/puzzles/puzzleSizeChoices.ts';

test('static artwork keeps its full dimensions and shape choices stay within 20% of the target', () => {
  const artwork = { width: 1200, height: 1897 };
  const choices = staticPuzzleSizes(artwork);
  assert.deepEqual(choices.map(({ targetCount }) => targetCount), [40, 72, 144, 300, 420]);
  for (const { targetCount, preset } of choices) {
    for (const [shape, size] of Object.entries(preset)) {
      assert.deepEqual({ width: size.width, height: size.height }, artwork);
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

test('a small image never needs to be enlarged to offer a cut', () => {
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