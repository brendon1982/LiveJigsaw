import type { PuzzleAttribution } from './PuzzleSource';

export const puzzleCredits = {
  prototype: {
    name: 'Me',
    description: 'Place holder art from the prototype. Left it in for fun.',
  },
  pending: {
    name: 'Artist credit pending',
    description: 'Placeholder for the artwork credits.',
    url: 'https://example.com',
  },
} as const satisfies Record<string, PuzzleAttribution>;