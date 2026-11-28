import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeFilterCount, makePuzzleFilterGroups, matchesPuzzleFilters, noPuzzleFilters, samePuzzleFilters } from '../../src/ui/puzzleFilters.ts';

const source = (theme, type, motion = 'Animated') => ({ tags: { theme, type }, motion });
const withoutProgress = (completions = 0) => ({ completions, hasResumableProgress: false });

test('picker filters match any selected tag within a group and require each active group to match', () => {
  const filters = { ...noPuzzleFilters, themes: ['Ocean', 'Space'], types: ['Parallax'], completion: 'Completed' };

  assert.ok(matchesPuzzleFilters(source('Ocean', 'Parallax'), withoutProgress(2), filters));
  assert.ok(matchesPuzzleFilters(source('Space', 'Parallax'), withoutProgress(1), filters));
  assert.ok(!matchesPuzzleFilters(source('Coast', 'Parallax'), withoutProgress(1), filters));
  assert.ok(!matchesPuzzleFilters(source('Ocean', 'Flat Illustration'), withoutProgress(1), filters));
  assert.ok(!matchesPuzzleFilters(source('Ocean', 'Parallax'), withoutProgress(), filters));
});

test('empty groups match any tags and completion history determines completion status', () => {
  const puzzle = source('Woodland', 'Flat Illustration');
  assert.ok(matchesPuzzleFilters(puzzle, withoutProgress(), noPuzzleFilters));
  assert.ok(matchesPuzzleFilters(puzzle, withoutProgress(3), noPuzzleFilters));

  const neverCompleted = { ...noPuzzleFilters, completion: 'Never completed' };
  assert.ok(matchesPuzzleFilters(puzzle, withoutProgress(), neverCompleted));
  assert.ok(!matchesPuzzleFilters(puzzle, withoutProgress(1), neverCompleted));
});

test('reordering selected tags does not change the applied filters', () => {
  const filters = { ...noPuzzleFilters, themes: ['Ocean', 'Space'], types: ['Parallax'] };
  assert.ok(samePuzzleFilters(filters, { ...filters, themes: ['Space', 'Ocean'] }));
  assert.ok(!samePuzzleFilters(filters, { ...filters, completion: 'Completed' }));
});

test('In progress matches a resumable attempt regardless of completion history', () => {
  const puzzle = source('Woodland', 'Flat Illustration');
  const filters = { ...noPuzzleFilters, completion: 'In progress' };
  for (const completions of [0, 1]) {
    assert.ok(matchesPuzzleFilters(puzzle, { completions, hasResumableProgress: true }, filters));
    assert.ok(!matchesPuzzleFilters(puzzle, { completions, hasResumableProgress: false }, filters));
  }
});

test('artwork motion is independent of illustration style and combines with the other filters', () => {
  const filters = { ...noPuzzleFilters, types: ['Flat Illustration'], motion: 'Static' };
  assert.equal(activeFilterCount(filters), 2);
  assert.ok(!samePuzzleFilters(filters, { ...filters, motion: 'Animated' }));
  assert.ok(matchesPuzzleFilters(source('Woodland', 'Flat Illustration', 'Static'), withoutProgress(1), filters));
  assert.ok(!matchesPuzzleFilters(source('Woodland', 'Flat Illustration'), withoutProgress(1), filters));
  assert.ok(!matchesPuzzleFilters(source('Ocean', 'Parallax', 'Static'), withoutProgress(1), filters));
});

test('theme choices and landing options share alphabetical order', () => {
  const { theme } = makePuzzleFilterGroups([]);
  const alphabetical = [...theme.choices].sort((first, second) => first.localeCompare(second));
  assert.deepEqual(theme.choices, alphabetical);
  assert.deepEqual(theme.options.map(({ label }) => label), alphabetical);
});

test('Pets replaces Animals in the theme choices', () => {
  const { theme } = makePuzzleFilterGroups([]);
  assert.ok(theme.choices.includes('Pets'));
  assert.ok(!theme.choices.includes('Animals'));
  const pets = theme.options.find(({ label }) => label === 'Pets');
  assert.deepEqual(pets?.filters.themes, ['Pets']);
});

test('artist choices are the unique credited names in alphabetical order', () => {
  const { artist } = makePuzzleFilterGroups([
    { attribution: { name: 'Rosa' } }, {}, { attribution: { description: 'No name' } },
    { attribution: { name: ' Ada ' } }, { attribution: { name: ' Rosa ' } }, { attribution: { name: '  ' } },
  ]);
  assert.deepEqual(artist.choices, ['Ada', 'Rosa']);
  assert.deepEqual(artist.options.map(({ filters }) => filters.artists), [['Ada'], ['Rosa']]);
});

test('artist filters match any selected credit and combine with the theme filter', () => {
  const filters = { ...noPuzzleFilters, artists: ['Ada', 'Rosa'], themes: ['Ocean'] };
  const credited = (name, theme = 'Ocean') => ({ ...source(theme, 'Parallax'), attribution: { name } });
  assert.equal(activeFilterCount(filters), 3);
  assert.ok(samePuzzleFilters(filters, { ...filters, artists: ['Rosa', 'Ada'] }));
  assert.ok(!samePuzzleFilters(filters, { ...filters, artists: ['Ada', 'Lee'] }));
  assert.ok(!samePuzzleFilters(filters, { ...filters, artists: [] }));
  assert.ok(matchesPuzzleFilters(credited('Ada'), withoutProgress(), filters));
  assert.ok(matchesPuzzleFilters(credited(' Rosa '), withoutProgress(), filters));
  assert.ok(!matchesPuzzleFilters(credited('Lee'), withoutProgress(), filters));
  assert.ok(!matchesPuzzleFilters(credited('Ada', 'Space'), withoutProgress(), filters));
  assert.ok(!matchesPuzzleFilters(source('Ocean', 'Parallax'), withoutProgress(), filters));
});
