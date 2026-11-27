import type { ChallengeMode } from '../domain/challengeModes';
import type { ConnectorStyleId } from '../domain/connectorStyles';
import type { PuzzlePlaySnapshot } from '../domain/PuzzlePlay';
import type { PieceShape, PuzzleSize } from '../domain/puzzleSizes';
import type { PuzzleAnimationSpeed } from '../puzzles/PuzzleSource';

export const trayPositions = ['Left', 'Right', 'Bottom', 'Top', 'Auto'] as const;
export type TrayPosition = typeof trayPositions[number];

export const pickerPreviewSizes = ['Compact', 'Full'] as const;
export type PickerPreviewSize = typeof pickerPreviewSizes[number];
export const defaultPickerPreviewSize: PickerPreviewSize = 'Full';

export const defaultAllowLoosePiecesOnBoard = true;

export type TrayFractions = Readonly<{ vertical: number; horizontal: number }>;
export const defaultTrayFractions: TrayFractions = { vertical: 0, horizontal: 0 };

export type SavedSettings = Readonly<{
  theme?: string;
  filter?: string;
  pickerPreviewSize: PickerPreviewSize;
  trayPosition?: TrayPosition;
  trayFractions: TrayFractions;
  allowLoosePiecesOnBoard: boolean;
}>;

export type PuzzleOptions = Readonly<{
  pieceCount?: number;
  pieceShape: PieceShape;
  connectorStyle: ConnectorStyleId;
  animationSpeed: PuzzleAnimationSpeed;
  challengeMode: ChallengeMode;
  pieceRotation: boolean;
}>;

export type PuzzleSetup = Omit<PuzzleOptions, 'pieceCount' | 'pieceShape'> & Readonly<{ size: PuzzleSize; seed: number }>;
export type PuzzleProgress = Readonly<{ setup: PuzzleSetup }> & PuzzlePlaySnapshot;
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

export function hasProgress({ placedPieceIds, parkedGroups, trayOrientations }: PuzzlePlaySnapshot): boolean {
  return placedPieceIds.length > 0 || parkedGroups.length > 0 || Object.keys(trayOrientations).length > 0;
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
    const attempts = hasProgress(progress)
      ? { ...this.data.progress, [sourceKey]: progress }
      : this.withoutProgress(sourceKey);
    this.update({ ...this.data, progress: attempts });
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
