import type { PuzzleAttribution } from './PuzzleSource';

export const puzzleCredits = {
  prototypeArtwork: {
    name: 'Me',
    description: 'Place holder art from the prototype. Left it in for fun.',
  },
  kenney: {
    name: 'Kenny',
    url: 'https://kenney.nl/',
  },
  craftpix: {
    name: 'Craftpix',
    url: 'https://craftpix.net/',
  },
} as const satisfies Record<string, PuzzleAttribution>;