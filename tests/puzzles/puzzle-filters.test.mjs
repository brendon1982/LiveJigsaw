import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesPuzzleFilters, noPuzzleFilters, samePuzzleFilters } from '../../src/ui/puzzleFilters.ts';

test('picker filters match any selected tag within a group and require each active group to match', () => {
  const filters = { themes: ['Ocean', 'Space'], types: ['Parallax'], completion: 'Completed' };

  assert.ok(matchesPuzzleFilters({ theme: 'Ocean', type: 'Parallax' }, 2, filters));
  assert.ok(matchesPuzzleFilters({ theme: 'Space', type: 'Parallax' }, 1, filters));
  assert.ok(!matchesPuzzleFilters({ theme: 'Coast', type: 'Parallax' }, 1, filters));
  assert.ok(!matchesPuzzleFilters({ theme: 'Ocean', type: 'Animated' }, 1, filters));
  assert.ok(!matchesPuzzleFilters({ theme: 'Ocean', type: 'Parallax' }, 0, filters));
});

test('empty groups match any tags and completion history determines completion status', () => {
  const tags = { theme: 'Woodland', type: 'Animated' };
  assert.ok(matchesPuzzleFilters(tags, 0, noPuzzleFilters));
  assert.ok(matchesPuzzleFilters(tags, 3, noPuzzleFilters));

  const neverCompleted = { ...noPuzzleFilters, completion: 'Never completed' };
  assert.ok(matchesPuzzleFilters(tags, 0, neverCompleted));
  assert.ok(!matchesPuzzleFilters(tags, 1, neverCompleted));
});

test('reordering selected tags does not change the applied filters', () => {
  const filters = { ...noPuzzleFilters, themes: ['Ocean', 'Space'], types: ['Parallax'] };
  assert.ok(samePuzzleFilters(filters, { ...filters, themes: ['Space', 'Ocean'] }));
  assert.ok(!samePuzzleFilters(filters, { ...filters, completion: 'Completed' }));
});
