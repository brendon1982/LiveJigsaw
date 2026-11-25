import { gameSave } from '../persistence';

export const puzzleFilters = {
  grayscale: 'Black and White',
  sepia: 'Sepia',
  faded: 'Faded',
};

export type PuzzleArtworkFilter = keyof typeof puzzleFilters;

const listeners = new Set<(filter: PuzzleArtworkFilter | undefined) => void>();

function readPuzzleFilter(): PuzzleArtworkFilter | undefined {
  const stored = gameSave.settings.filter;
  if (stored && Object.hasOwn(puzzleFilters, stored)) return stored as PuzzleArtworkFilter;
}

export let activePuzzleFilter = readPuzzleFilter();

export function selectPuzzleFilter(filter: PuzzleArtworkFilter | undefined) {
  if (activePuzzleFilter === filter) return;
  activePuzzleFilter = filter;
  for (const listener of listeners) listener(filter);
  gameSave.updateSettings({ filter });
}

export function onPuzzleFilterChange(listener: (filter: PuzzleArtworkFilter | undefined) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
