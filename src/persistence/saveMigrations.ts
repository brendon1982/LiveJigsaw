type DocumentFields = Record<string, unknown>;
type Migration = (document: DocumentFields) => DocumentFields;

const migrations: readonly Migration[] = [
  // Version 0 represents the original standalone browser settings.
  ({ theme, filter }) => ({ settings: { theme, filter }, progress: {}, history: {} }),
  (document) => ({
    ...document,
    settings: {
      ...(isRecord(document.settings) ? document.settings : {}),
      trayFractions: { vertical: 0, horizontal: 0 },
    },
  }),
  (document) => ({
    ...document,
    ...(isRecord(document.recentOptions) && { recentOptions: withStandardMode(document.recentOptions) }),
    progress: mapSaveEntries(document.progress, withStandardSetup),
    history: mapSaveEntries(document.history, (value) => Array.isArray(value) ? value.map(withStandardSetup) : value),
  }),
  (document) => ({
    ...document,
    ...(isRecord(document.recentOptions) && { recentOptions: renameStandardMode(document.recentOptions) }),
    progress: mapSaveEntries(document.progress, renameStandardSetup),
    history: mapSaveEntries(document.history, (value) => Array.isArray(value) ? value.map(renameStandardSetup) : value),
  }),
  (document) => ({
    ...document,
    ...(isRecord(document.recentOptions) && { recentOptions: replaceSizeLabel(document.recentOptions) }),
    progress: mapSaveEntries(document.progress, removeSetupSizeLabel),
    history: mapSaveEntries(document.history, (value) => Array.isArray(value) ? value.map(removeSetupSizeLabel) : value),
  }),
  (document) => ({
    ...document,
    recentOptions: withRotationOff(document.recentOptions),
    progress: mapSaveEntries(document.progress, (value) => isRecord(value)
      ? { ...withRotationSetup(value), trayOrientations: {} } : value),
    history: mapSaveEntries(document.history, (value) => Array.isArray(value)
      ? value.map((entry) => isRecord(entry) ? withRotationSetup(entry) : entry) : value),
  }),
  (document) => {
    if (!isRecord(document.recentOptions)) return document;
    const { pieceCount, ...options } = document.recentOptions;
    return { ...document, recentOptions: { ...options, pieceCount: pieceCount === 392 ? 420 : pieceCount, pieceShape: 'square' } };
  },
];

function withRotationOff(value: unknown): unknown {
  return isRecord(value) ? { ...value, pieceRotation: false } : value;
}

function withRotationSetup(entry: DocumentFields): DocumentFields {
  return { ...entry, setup: withRotationOff(entry.setup) };
}

function withStandardMode(value: unknown): unknown {
  return isRecord(value) ? { ...value, challengeMode: 'standard' } : value;
}

function withStandardSetup(value: unknown): unknown {
  return isRecord(value) ? { ...value, setup: withStandardMode(value.setup) } : value;
}

function renameStandardMode(value: unknown): unknown {
  return isRecord(value) && value.challengeMode === 'standard' ? { ...value, challengeMode: 'none' } : value;
}

function renameStandardSetup(value: unknown): unknown {
  return isRecord(value) ? { ...value, setup: renameStandardMode(value.setup) } : value;
}

const version4PieceCounts = new Map([['Classic', 8], ['Large', 32], ['Dense', 64], ['Expert', 128]]);

function replaceSizeLabel({ sizeLabel, ...options }: DocumentFields): DocumentFields {
  const pieceCount = typeof sizeLabel === 'string' ? version4PieceCounts.get(sizeLabel) : undefined;
  return pieceCount === undefined ? options : { ...options, pieceCount };
}

function removeSetupSizeLabel(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.setup) || !isRecord(value.setup.size)) return value;
  const { label: _label, ...size } = value.setup.size;
  return { ...value, setup: { ...value.setup, size } };
}

function mapSaveEntries(value: unknown, transform: (entry: unknown) => unknown): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, transform(entry)]));
}

export const saveVersion = migrations.length;

export function isRecord(value: unknown): value is DocumentFields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function migrateSave(value: unknown): DocumentFields | undefined {
  if (!isRecord(value)) return;
  const { version } = value;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0 || version > saveVersion) return;

  let document = value;
  for (let from = version; from < saveVersion; from += 1) {
    document = { ...migrations[from](document), version: from + 1 };
  }
  return document;
}
