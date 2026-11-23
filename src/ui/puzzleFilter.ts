export const puzzleFilters = {
  grayscale: 'Black and White',
  sepia: 'Sepia',
  faded: 'Faded',
};

export type PuzzleArtworkFilter = keyof typeof puzzleFilters;

const storageKey = 'live-jigsaw.puzzle-filter';
const listeners = new Set<(filter: PuzzleArtworkFilter | undefined) => void>();

function readPuzzleFilter(): PuzzleArtworkFilter | undefined {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored && Object.hasOwn(puzzleFilters, stored)) return stored as PuzzleArtworkFilter;
  } catch {
    // Storage can be unavailable in a restricted browser context.
  }
}

export let activePuzzleFilter = readPuzzleFilter();

export function selectPuzzleFilter(filter: PuzzleArtworkFilter | undefined) {
  if (activePuzzleFilter === filter) return;
  activePuzzleFilter = filter;
  for (const listener of listeners) listener(filter);
  try {
    if (filter) window.localStorage.setItem(storageKey, filter);
    else window.localStorage.removeItem(storageKey);
  } catch {
    // The selected filter still applies for this session.
  }
}

export function onPuzzleFilterChange(listener: (filter: PuzzleArtworkFilter | undefined) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
