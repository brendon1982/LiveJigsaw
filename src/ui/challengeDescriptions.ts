import { challengeModes, type ChallengeMode } from '../domain/challengeModes';

export const challengeDescriptions = {
  none: 'Play without extra rules.',
  sequential: 'Only one piece is unlocked at a time. Place it to unlock the next piece.',
  'sequential-window': `Up to ${challengeModes['sequential-window'].trayWindow} pieces are unlocked at a time. Place them in any order; each placement unlocks the next piece.`,
  'no-guide': 'The board has no artwork guide. Corner pieces are your friends.',
  seed: 'Start by placing any piece in its correct spot. After that, each new placement must touch a correctly placed piece along an edge.',
} satisfies Record<ChallengeMode, string>;