import { puzzleThemes, puzzleTypes, type PuzzleTags, type PuzzleTheme, type PuzzleType } from '../puzzles/PuzzleTags.ts';

export const completionFilters = ['All', 'Completed', 'Never completed'] as const;
type CompletionFilter = typeof completionFilters[number];

export type PuzzleFilters = Readonly<{
  themes: readonly PuzzleTheme[];
  types: readonly PuzzleType[];
  completion: CompletionFilter;
}>;

export const noPuzzleFilters: PuzzleFilters = { themes: [], types: [], completion: 'All' };

export function activeFilterCount({ themes, types, completion }: PuzzleFilters) {
  return themes.length + types.length + Number(completion !== 'All');
}

export function samePuzzleFilters(first: PuzzleFilters, second: PuzzleFilters) {
  return first.completion === second.completion
    && puzzleThemes.every((theme) => first.themes.includes(theme) === second.themes.includes(theme))
    && puzzleTypes.every((type) => first.types.includes(type) === second.types.includes(type));
}

export function matchesPuzzleFilters(tags: PuzzleTags, completions: number, filters: PuzzleFilters) {
  const matchesTheme = !filters.themes.length || filters.themes.includes(tags.theme);
  const matchesType = !filters.types.length || filters.types.includes(tags.type);
  const status = completions > 0 ? 'Completed' : 'Never completed';
  return matchesTheme && matchesType && (filters.completion === 'All' || filters.completion === status);
}
