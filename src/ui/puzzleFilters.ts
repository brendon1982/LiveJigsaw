import { puzzleThemes, puzzleTypes, type PuzzleTheme, type PuzzleType } from '../puzzles/PuzzleTags.ts';
import { creditedArtistName, type PuzzleMotion, type PuzzleSource } from '../puzzles/PuzzleSource.ts';

const completionFilters = ['All', 'Completed', 'Never completed'] as const;
type CompletionFilter = typeof completionFilters[number];
const motionFilters = ['All', 'Static', 'Animated'] as const satisfies readonly ('All' | PuzzleMotion)[];

export type PuzzleFilters = Readonly<{
  themes: readonly PuzzleTheme[];
  artists: readonly string[];
  types: readonly PuzzleType[];
  completion: CompletionFilter;
  motion: typeof motionFilters[number];
}>;

export const noPuzzleFilters: PuzzleFilters = { themes: [], artists: [], types: [], completion: 'All', motion: 'All' };

function filterGroup<T extends string>(title: string, choices: readonly T[], select: (choice: T) => Partial<PuzzleFilters>) {
  return {
    title,
    choices,
    options: choices.map((label) => ({ label, filters: { ...noPuzzleFilters, ...select(label) } })),
  };
}

export function makePuzzleFilterGroups(sources: readonly Pick<PuzzleSource, 'attribution'>[]) {
  const artistNames = new Set<string>();
  for (const { attribution } of sources) {
    const artist = creditedArtistName(attribution);
    if (artist) artistNames.add(artist);
  }
  const themes = [...puzzleThemes].sort((first, second) => first.localeCompare(second));
  const artists = [...artistNames].sort((first, second) => first.localeCompare(second));
  return {
    theme: filterGroup('Theme', themes, (theme) => ({ themes: [theme] })),
    artist: filterGroup('Artist', artists, (artist) => ({ artists: [artist] })),
    type: filterGroup('Type', puzzleTypes, (type) => ({ types: [type] })),
    completion: filterGroup('Completion', completionFilters, (completion) => ({ completion })),
    motion: filterGroup('Artwork motion', motionFilters, (motion) => ({ motion })),
  };
}
export type PuzzleFilterCategory = keyof ReturnType<typeof makePuzzleFilterGroups>;

export function activeFilterCount({ themes, artists, types, completion, motion }: PuzzleFilters) {
  return themes.length + artists.length + types.length + Number(completion !== 'All') + Number(motion !== 'All');
}

export function samePuzzleFilters(first: PuzzleFilters, second: PuzzleFilters) {
  return first.completion === second.completion
    && first.motion === second.motion
    && puzzleThemes.every((theme) => first.themes.includes(theme) === second.themes.includes(theme))
    && first.artists.length === second.artists.length && first.artists.every((artist) => second.artists.includes(artist))
    && puzzleTypes.every((type) => first.types.includes(type) === second.types.includes(type));
}

export function matchesPuzzleFilters(
  { tags, motion, attribution }: Pick<PuzzleSource, 'tags' | 'motion' | 'attribution'>, completions: number, filters: PuzzleFilters,
) {
  const matchesTheme = !filters.themes.length || filters.themes.includes(tags.theme);
  const artist = creditedArtistName(attribution);
  const matchesArtist = !filters.artists.length || (artist !== undefined && filters.artists.includes(artist));
  const matchesType = !filters.types.length || filters.types.includes(tags.type);
  const status = completions > 0 ? 'Completed' : 'Never completed';
  return matchesTheme && matchesArtist && matchesType && (filters.motion === 'All' || filters.motion === motion)
    && (filters.completion === 'All' || filters.completion === status);
}
