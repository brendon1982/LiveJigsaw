import { puzzleThemes, puzzleTypes, type PuzzleTheme, type PuzzleType } from '../puzzles/PuzzleTags.ts';
import type { PuzzleMotion, PuzzleSource } from '../puzzles/PuzzleSource.ts';

const completionFilters = ['All', 'Completed', 'Never completed'] as const;
type CompletionFilter = typeof completionFilters[number];
const motionFilters = ['All', 'Static', 'Animated'] as const satisfies readonly ('All' | PuzzleMotion)[];

export type PuzzleFilters = Readonly<{
  themes: readonly PuzzleTheme[];
  types: readonly PuzzleType[];
  completion: CompletionFilter;
  motion: typeof motionFilters[number];
}>;

export const noPuzzleFilters: PuzzleFilters = { themes: [], types: [], completion: 'All', motion: 'All' };

function filterGroup<T extends string>(title: string, choices: readonly T[], select: (choice: T) => Partial<PuzzleFilters>) {
  return {
    title,
    choices,
    options: choices.map((label) => ({ label, filters: { ...noPuzzleFilters, ...select(label) } })),
  };
}

export const puzzleFilterGroups = {
  theme: filterGroup('Theme', puzzleThemes, (theme) => ({ themes: [theme] })),
  type: filterGroup('Type', puzzleTypes, (type) => ({ types: [type] })),
  completion: filterGroup('Completion', completionFilters, (completion) => ({ completion })),
  motion: filterGroup('Artwork motion', motionFilters, (motion) => ({ motion })),
};
export type PuzzleFilterCategory = keyof typeof puzzleFilterGroups;

export function activeFilterCount({ themes, types, completion, motion }: PuzzleFilters) {
  return themes.length + types.length + Number(completion !== 'All') + Number(motion !== 'All');
}

export function samePuzzleFilters(first: PuzzleFilters, second: PuzzleFilters) {
  return first.completion === second.completion
    && first.motion === second.motion
    && puzzleThemes.every((theme) => first.themes.includes(theme) === second.themes.includes(theme))
    && puzzleTypes.every((type) => first.types.includes(type) === second.types.includes(type));
}

export function matchesPuzzleFilters({ tags, motion }: Pick<PuzzleSource, 'tags' | 'motion'>, completions: number, filters: PuzzleFilters) {
  const matchesTheme = !filters.themes.length || filters.themes.includes(tags.theme);
  const matchesType = !filters.types.length || filters.types.includes(tags.type);
  const status = completions > 0 ? 'Completed' : 'Never completed';
  return matchesTheme && matchesType && (filters.motion === 'All' || filters.motion === motion)
    && (filters.completion === 'All' || filters.completion === status);
}
