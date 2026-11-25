type ChallengeModeRules = Readonly<{
  label: string;
  trayWindow: number | null;
  requiresSeedConnection: boolean;
  hideGuide: boolean;
}>;

export const challengeModes = {
  standard: { label: 'Standard', trayWindow: null, requiresSeedConnection: false, hideGuide: false },
  sequential: { label: 'Sequential', trayWindow: 1, requiresSeedConnection: false, hideGuide: false },
  'sequential-window': { label: 'Sequential Window', trayWindow: 4, requiresSeedConnection: false, hideGuide: false },
  'no-guide': { label: 'No Guide', trayWindow: null, requiresSeedConnection: false, hideGuide: true },
  seed: { label: 'Seed', trayWindow: null, requiresSeedConnection: true, hideGuide: false },
} as const satisfies Record<string, ChallengeModeRules>;

export type ChallengeMode = keyof typeof challengeModes;
