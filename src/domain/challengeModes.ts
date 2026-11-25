export const challengeModes = {
  standard: 'Standard',
  sequential: 'Sequential',
  'sequential-window': 'Sequential Window',
  'no-guide': 'No Guide',
  seed: 'Seed',
} as const;

export type ChallengeMode = keyof typeof challengeModes;
