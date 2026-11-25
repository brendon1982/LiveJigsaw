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
];

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
