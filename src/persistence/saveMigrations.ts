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
];

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
