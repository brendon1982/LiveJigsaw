import { connectorStyles, type ConnectorStyleId } from '../domain/connectorStyles';
import { createPuzzle, puzzleSizes, type PuzzleSize } from '../domain/puzzleSizes';
import { puzzleAnimationSpeeds, type PuzzleAnimationSpeed } from '../puzzles/PuzzleSource';
import { trayPositions } from './GameSave';
import type { PuzzleCompletion, PuzzleOptions, PuzzleProgress, PuzzleSetup, SaveData, SaveStorage } from './GameSave';

const storageKey = 'live-jigsaw.save';
const themeKey = 'live-jigsaw.theme';
const filterKey = 'live-jigsaw.puzzle-filter';
const version = 1;
const emptySave: SaveData = { settings: {}, progress: {}, history: {} };

export class BrowserSaveStorage implements SaveStorage {
  private newerVersion = false;

  load(): SaveData {
    try {
      const storage = window.localStorage;
      const stored = storage.getItem(storageKey);
      const parsed = stored === null ? undefined : readJson(stored);
      if (isRecord(parsed) && parsed.version === version) return readSave(parsed);
      this.newerVersion = isRecord(parsed) && typeof parsed.version === 'number' && parsed.version > version;

      const theme = storage.getItem(themeKey) ?? undefined;
      const filter = storage.getItem(filterKey) ?? undefined;
      const data = { ...emptySave, settings: { theme, filter } };
      if ((theme || filter) && this.write(data)) this.removeLegacySettings(storage);
      return data;
    } catch {
      return emptySave;
    }
  }

  save(data: SaveData) {
    this.write(data);
  }

  private removeLegacySettings(storage: Storage) {
    try {
      storage.removeItem(themeKey);
      storage.removeItem(filterKey);
    } catch {
      // The migrated settings are already in the current save.
    }
  }

  private write(data: SaveData): boolean {
    if (this.newerVersion) return false;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ version, ...data }));
      return true;
    } catch {
      return false;
    }
  }
}

function readJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSave(data: Record<string, unknown>): SaveData {
  const settings = isRecord(data.settings) ? data.settings : {};
  return {
    settings: {
      theme: typeof settings.theme === 'string' ? settings.theme : undefined,
      filter: typeof settings.filter === 'string' ? settings.filter : undefined,
      trayPosition: trayPositions.find((position) => position === settings.trayPosition),
    },
    recentOptions: readOptions(data.recentOptions),
    progress: readEntries(data.progress, readProgress),
    history: readEntries(data.history, (value) => Array.isArray(value)
      ? value.map(readCompletion).filter((entry): entry is PuzzleCompletion => entry !== undefined)
      : undefined),
  };
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

function readOptions(value: unknown): PuzzleOptions | undefined {
  if (!isRecord(value)) return;
  const { sizeLabel, connectorStyle, animationSpeed } = value;
  if (typeof sizeLabel === 'string' && isConnectorStyle(connectorStyle) && isAnimationSpeed(animationSpeed)) {
    return { sizeLabel, connectorStyle, animationSpeed };
  }
}

const maximumPieceCount = Math.max(...puzzleSizes.map(({ columns, rows }) => columns * rows));

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function readSize(value: unknown): PuzzleSize | undefined {
  if (!isRecord(value)) return;
  const { label, width, height, columns, rows, snapTolerance } = value;
  if (typeof label !== 'string' || !isPositiveInteger(width) || !isPositiveInteger(height)
    || !isPositiveInteger(columns) || !isPositiveInteger(rows) || columns * rows > maximumPieceCount
    || width < columns || height < rows
    || typeof snapTolerance !== 'number' || !Number.isFinite(snapTolerance) || snapTolerance < 0) return;
  return { label, width, height, columns, rows, snapTolerance };
}

function readSetup(value: unknown): PuzzleSetup | undefined {
  if (!isRecord(value)) return;
  const size = readSize(value.size);
  const { seed, connectorStyle, animationSpeed } = value;
  if (!size || typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff
    || !isConnectorStyle(connectorStyle) || !isAnimationSpeed(animationSpeed)) return;
  return { size, seed, connectorStyle, animationSpeed };
}

function readProgress(value: unknown): PuzzleProgress | undefined {
  if (!isRecord(value)) return;
  const setup = readSetup(value.setup);
  const { placedPieceIds } = value;
  if (!setup || !Array.isArray(placedPieceIds) || placedPieceIds.length === 0
    || placedPieceIds.length >= setup.size.columns * setup.size.rows
    || !placedPieceIds.every((id): id is string => typeof id === 'string')) return;
  const puzzle = createPuzzle(setup.size, setup.connectorStyle, setup.seed);
  if (puzzle.restorePlacements(placedPieceIds)) return { setup, placedPieceIds };
}

function readCompletion(value: unknown): PuzzleCompletion | undefined {
  if (!isRecord(value)) return;
  const setup = readSetup(value.setup);
  const { completedAt } = value;
  if (setup && typeof completedAt === 'string' && Number.isFinite(Date.parse(completedAt))) {
    return { setup, completedAt };
  }
}
