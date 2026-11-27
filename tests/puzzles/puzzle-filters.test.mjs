import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeFilterCount, matchesPuzzleFilters, noPuzzleFilters, samePuzzleFilters } from '../../src/ui/puzzleFilters.ts';

const source = (theme, type, motion = 'Animated') => ({ tags: { theme, type }, motion });

test('picker filters match any selected tag within a group and require each active group to match', () => {
  const filters = { ...noPuzzleFilters, themes: ['Ocean', 'Space'], types: ['Parallax'], completion: 'Completed' };

  assert.ok(matchesPuzzleFilters(source('Ocean', 'Parallax'), 2, filters));
  assert.ok(matchesPuzzleFilters(source('Space', 'Parallax'), 1, filters));
  assert.ok(!matchesPuzzleFilters(source('Coast', 'Parallax'), 1, filters));
  assert.ok(!matchesPuzzleFilters(source('Ocean', 'Flat Illustration'), 1, filters));
  assert.ok(!matchesPuzzleFilters(source('Ocean', 'Parallax'), 0, filters));
});

test('empty groups match any tags and completion history determines completion status', () => {
  const puzzle = source('Woodland', 'Flat Illustration');
  assert.ok(matchesPuzzleFilters(puzzle, 0, noPuzzleFilters));
  assert.ok(matchesPuzzleFilters(puzzle, 3, noPuzzleFilters));

  const neverCompleted = { ...noPuzzleFilters, completion: 'Never completed' };
  assert.ok(matchesPuzzleFilters(puzzle, 0, neverCompleted));
  assert.ok(!matchesPuzzleFilters(puzzle, 1, neverCompleted));
});

test('reordering selected tags does not change the applied filters', () => {
  const filters = { ...noPuzzleFilters, themes: ['Ocean', 'Space'], types: ['Parallax'] };
  assert.ok(samePuzzleFilters(filters, { ...filters, themes: ['Space', 'Ocean'] }));
  assert.ok(!samePuzzleFilters(filters, { ...filters, completion: 'Completed' }));
});

test('artwork motion is independent of illustration style and combines with the other filters', () => {
  const filters = { ...noPuzzleFilters, types: ['Flat Illustration'], motion: 'Static' };
  assert.equal(activeFilterCount(filters), 2);
  assert.ok(!samePuzzleFilters(filters, { ...filters, motion: 'Animated' }));
  assert.ok(matchesPuzzleFilters(source('Woodland', 'Flat Illustration', 'Static'), 1, filters));
  assert.ok(!matchesPuzzleFilters(source('Woodland', 'Flat Illustration'), 1, filters));
  assert.ok(!matchesPuzzleFilters(source('Ocean', 'Parallax', 'Static'), 1, filters));
});
