import type { PuzzleAttribution } from './PuzzleSource';

export const puzzleCredits = {
  prototypeArtwork: {
    name: 'Me',
    description: 'Place holder art from the prototype. Left it in for fun.',
  },
  kenney: {
    name: 'Kenny',
    sourceUrl: 'https://kenney.nl/',
  },
  craftpix: {
    name: 'Craftpix',
    sourceUrl: 'https://craftpix.net/',
  },
} as const satisfies Record<string, PuzzleAttribution>;