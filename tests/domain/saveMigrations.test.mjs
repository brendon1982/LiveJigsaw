import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateSave } from '../../src/persistence/saveMigrations.ts';

test('version 8 adds parking defaults without changing a saved layout, progress or history', () => {
  const setup = {
    size: { width: 1792, height: 1008, columns: 28, rows: 14, snapTolerance: 16 },
    seed: 42, connectorStyle: 'classic', animationSpeed: 'Normal', challengeMode: 'none', pieceRotation: true,
  };
  const progress = { setup, placedPieceIds: ['piece-0-0'], trayOrientations: { 'piece-0-1': 3 } };
  const original = {
    version: 8,
    settings: { theme: 'Slate', filter: 'sepia', trayPosition: 'Right', trayFractions: { vertical: 0.4, horizontal: 0.1 } },
    recentOptions: { pieceCount: 420, pieceShape: 'square', pieceRotation: true },
    progress: { Windmill: progress },
    history: { Lighthouse: [{ setup, completedAt: '2025-01-01T12:00:00.000Z' }] },
  };

  assert.deepEqual(migrateSave(original), {
    ...original,
    version: 9,
    settings: { ...original.settings, missedDropMode: 'return-to-tray' },
    progress: { Windmill: { ...progress, parkedGroups: [] } },
  });
});