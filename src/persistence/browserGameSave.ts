import { challengeModes, type ChallengeMode } from '../domain/challengeModes';
import { connectorStyles, type ConnectorStyleId } from '../domain/connectorStyles';
import { PuzzlePlay } from '../domain/PuzzlePlay';
import { createPuzzle, defaultPieceShape, getPieceCount, pieceShapeIds, puzzleSizePresets, type PuzzleSize } from '../domain/puzzleSizes';
import { puzzleAnimationSpeeds, type PuzzleAnimationSpeed } from '../puzzles/PuzzleSource';
import {
  defaultMissedDropMode, defaultTrayFractions, hasProgress, trayPositions,
  type PuzzleCompletion, type PuzzleOptions, type PuzzleProgress, type PuzzleSetup, type SaveData, type SaveStorage,
} from './GameSave';
import { isRecord, migrateSave, saveVersion } from './saveMigrations';

const storageKey = 'live-jigsaw.save';
const themeKey = 'live-jigsaw.theme';
const filterKey = 'live-jigsaw.puzzle-filter';
const emptySave: SaveData = {
  settings: { trayFractions: defaultTrayFractions, missedDropMode: defaultMissedDropMode }, progress: {}, history: {},
};

export class BrowserSaveStorage implements SaveStorage {
  private preserveStoredSave = false;

  load(): SaveData {
    try {
      const storage = window.localStorage;
      const stored = storage.getItem(storageKey);
      const original = stored === null ? readLegacySettings(storage) : readJson(stored);
      const migrated = migrateSave(original);
      if (!migrated) {
        this.preserveStoredSave = stored !== null;
        return emptySave;
      }

      const data = readSave(migrated);
      if (migrated !== original && this.writeDocument(migrated) && stored === null) this.removeLegacySettings(storage);
      return data;
    } catch {
      this.preserveStoredSave = true;
      return emptySave;
    }
  }

  save(data: SaveData) {
    this.writeDocument({ version: saveVersion, ...data });
  }

  private removeLegacySettings(storage: Storage) {
    try {
      storage.removeItem(themeKey);
      storage.removeItem(filterKey);
    } catch {
      // The migrated settings are already in the current save.
    }
  }

  private writeDocument(document: Record<string, unknown>): boolean {
    if (this.preserveStoredSave) return false;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(document));
      return true;
    } catch {
      return false;
    }
  }
}

function readLegacySettings(storage: Storage) {
  const theme = storage.getItem(themeKey) ?? undefined;
  const filter = storage.getItem(filterKey) ?? undefined;
  if (theme !== undefined || filter !== undefined) return { version: 0, theme, filter };
}

function readJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readSave(data: Record<string, unknown>): SaveData {
  const settings = isRecord(data.settings) ? data.settings : {};
  const trayFractions = isRecord(settings.trayFractions) ? settings.trayFractions : {};
  return {
    settings: {
      theme: typeof settings.theme === 'string' ? settings.theme : undefined,
      filter: typeof settings.filter === 'string' ? settings.filter : undefined,
      trayPosition: trayPositions.find((position) => position === settings.trayPosition),
      missedDropMode: settings.missedDropMode === 'park-on-board' ? settings.missedDropMode : defaultMissedDropMode,
      trayFractions: {
        vertical: readFraction(trayFractions.vertical) ?? defaultTrayFractions.vertical,
        horizontal: readFraction(trayFractions.horizontal) ?? defaultTrayFractions.horizontal,
      },
    },
    recentOptions: readOptions(data.recentOptions),
    progress: readEntries(data.progress, readProgress),
    history: readEntries(data.history, (value) => Array.isArray(value)
      ? value.map(readCompletion).filter((entry): entry is PuzzleCompletion => entry !== undefined)
      : undefined),
  };
}

function readFraction(value: unknown): number | undefined {
  if (typeof value === 'number' && value >= 0 && value <= 1) return value;
}

function readEntries<T>(data: unknown, readEntry: (value: unknown) => T | undefined): Record<string, T> {
  const entries: [string, T][] = [];
  if (isRecord(data)) {
    for (const [key, value] of Object.entries(data)) {
      const entry = readEntry(value);
      if (entry !== undefined) entries.push([key, entry]);
    }
  }
  return Object.fromEntries(entries);
}

function isConnectorStyle(value: unknown): value is ConnectorStyleId {
  return typeof value === 'string' && Object.hasOwn(connectorStyles, value);
}

function isAnimationSpeed(value: unknown): value is PuzzleAnimationSpeed {
  return puzzleAnimationSpeeds.some((speed) => speed === value);
}

function isChallengeMode(value: unknown): value is ChallengeMode {
  return typeof value === 'string' && Object.hasOwn(challengeModes, value);
}

function readOptions(value: unknown): PuzzleOptions | undefined {
  if (!isRecord(value)) return;
  const { pieceCount, connectorStyle, animationSpeed, challengeMode, pieceRotation } = value;
  const pieceShape = pieceShapeIds.find((shape) => shape === value.pieceShape) ?? defaultPieceShape;
  if (isConnectorStyle(connectorStyle) && isAnimationSpeed(animationSpeed) && isChallengeMode(challengeMode)
    && typeof pieceRotation === 'boolean') {
    return {
      pieceCount: isPositiveInteger(pieceCount) ? pieceCount : undefined, pieceShape,
      connectorStyle, animationSpeed, challengeMode, pieceRotation,
    };
  }
}

const maximumPieceCount = Math.max(...puzzleSizePresets.map((preset) => getPieceCount(preset.square)));

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function readSize(value: unknown): PuzzleSize | undefined {
  if (!isRecord(value)) return;
  const { width, height, columns, rows, snapTolerance } = value;
  if (!isPositiveInteger(width) || !isPositiveInteger(height)
    || !isPositiveInteger(columns) || !isPositiveInteger(rows) || getPieceCount({ columns, rows }) > maximumPieceCount
    || width < columns || height < rows
    || typeof snapTolerance !== 'number' || !Number.isFinite(snapTolerance) || snapTolerance < 0) return;
  return { width, height, columns, rows, snapTolerance };
}

function readSetup(value: unknown): PuzzleSetup | undefined {
  if (!isRecord(value)) return;
  const size = readSize(value.size);
  const { seed, connectorStyle, animationSpeed, challengeMode, pieceRotation } = value;
  if (!size || typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff
    || !isConnectorStyle(connectorStyle) || !isAnimationSpeed(animationSpeed) || !isChallengeMode(challengeMode)
    || typeof pieceRotation !== 'boolean') return;
  return { size, seed, connectorStyle, animationSpeed, challengeMode, pieceRotation };
}

function readProgress(value: unknown): PuzzleProgress | undefined {
  if (!isRecord(value)) return;
  const setup = readSetup(value.setup);
  const { placedPieceIds, trayOrientations, parkedGroups } = value;
  if (!setup || !isRecord(trayOrientations) || !Array.isArray(placedPieceIds)
    || !Array.isArray(parkedGroups)
    || placedPieceIds.length >= getPieceCount(setup.size)
    || !placedPieceIds.every((id): id is string => typeof id === 'string')) return;
  const puzzle = createPuzzle(setup.size, setup.connectorStyle, setup.seed, setup.challengeMode, setup.pieceRotation);
  const play = new PuzzlePlay(puzzle);
  if (!play.restore({ placedPieceIds, trayOrientations, parkedGroups })) return;
  const snapshot = play.snapshot();
  if (hasProgress(snapshot)) return { setup, ...snapshot };
}

function readCompletion(value: unknown): PuzzleCompletion | undefined {
  if (!isRecord(value)) return;
  const setup = readSetup(value.setup);
  const { completedAt } = value;
  if (setup && typeof completedAt === 'string' && Number.isFinite(Date.parse(completedAt))) {
    return { setup, completedAt };
  }
}
