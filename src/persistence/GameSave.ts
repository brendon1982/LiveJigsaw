import type { ChallengeMode } from '../domain/challengeModes';
import type { ConnectorStyleId } from '../domain/connectorStyles';
import type { PuzzleSize } from '../domain/puzzleSizes';
import type { PuzzleAnimationSpeed } from '../puzzles/PuzzleSource';

export const trayPositions = ['Left', 'Right', 'Bottom', 'Top', 'Auto'] as const;
export type TrayPosition = typeof trayPositions[number];

export type TrayFractions = Readonly<{ vertical: number; horizontal: number }>;
export const defaultTrayFractions: TrayFractions = { vertical: 0, horizontal: 0 };

export type SavedSettings = Readonly<{
  theme?: string;
  filter?: string;
  trayPosition?: TrayPosition;
  trayFractions: TrayFractions;
}>;

export type PuzzleOptions = Readonly<{
  pieceCount?: number;
  connectorStyle: ConnectorStyleId;
  animationSpeed: PuzzleAnimationSpeed;
  challengeMode: ChallengeMode;
}>;

export type PuzzleSetup = Omit<PuzzleOptions, 'pieceCount'> & Readonly<{ size: PuzzleSize; seed: number }>;
export type PuzzleProgress = Readonly<{ setup: PuzzleSetup; placedPieceIds: readonly string[] }>;
export type PuzzleCompletion = Readonly<{ setup: PuzzleSetup; completedAt: string }>;

export type SaveData = Readonly<{
  settings: SavedSettings;
  recentOptions?: PuzzleOptions;
  progress: Readonly<Record<string, PuzzleProgress>>;
  history: Readonly<Record<string, readonly PuzzleCompletion[]>>;
}>;

export interface SaveStorage {
  load(): SaveData;
  save(data: SaveData): void;
}

export class GameSave {
  private data: SaveData;

  constructor(private readonly storage: SaveStorage) {
    this.data = storage.load();
  }

  get settings(): SavedSettings {
    return this.data.settings;
  }

  updateSettings(changes: Partial<SavedSettings>) {
    this.update({ ...this.data, settings: { ...this.data.settings, ...changes } });
  }

  get recentOptions(): PuzzleOptions | undefined {
    return this.data.recentOptions;
  }

  getProgress(sourceKey: string): PuzzleProgress | undefined {
    return Object.hasOwn(this.data.progress, sourceKey) ? this.data.progress[sourceKey] : undefined;
  }

  completionCount(sourceKey: string): number {
    return Object.hasOwn(this.data.history, sourceKey) ? this.data.history[sourceKey].length : 0;
  }

  startAttempt(sourceKey: string, recentOptions: PuzzleOptions) {
    this.update({ ...this.data, recentOptions, progress: this.withoutProgress(sourceKey) });
  }

  saveProgress(sourceKey: string, progress: PuzzleProgress) {
    this.update({ ...this.data, progress: { ...this.data.progress, [sourceKey]: progress } });
  }

  completeAttempt(sourceKey: string, completion: PuzzleCompletion) {
    const prior = Object.hasOwn(this.data.history, sourceKey) ? this.data.history[sourceKey] : [];
    const history = { ...this.data.history, [sourceKey]: [...prior, completion] };
    this.update({ ...this.data, progress: this.withoutProgress(sourceKey), history });
  }

  private withoutProgress(sourceKey: string) {
    const progress = { ...this.data.progress };
    delete progress[sourceKey];
    return progress;
  }

  private update(data: SaveData) {
    this.data = data;
    this.storage.save(data);
  }
}
