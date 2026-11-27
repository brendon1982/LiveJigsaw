import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateSave } from '../../src/persistence/saveMigrations.ts';

test('version 8 keeps loose pieces disabled without changing a saved layout, progress or history', () => {
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
    version: 12,
    settings: { ...original.settings, allowLoosePiecesOnBoard: false, pickerPreviewSize: 'Full' },
    progress: { Windmill: { ...progress, parkedGroups: [] } },
  });
});

test('version 9 keeps either loose-piece preference, parked groups and completion history', () => {
  const setup = {
    size: { width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 16 },
    seed: 42, connectorStyle: 'classic', animationSpeed: 'Normal', challengeMode: 'none', pieceRotation: false,
  };
  const parkedGroups = [{
    memberIds: ['piece-0-1'], anchorPieceId: 'piece-0-1', position: { x: -80, y: 50 }, quarterTurns: 0,
  }];
  const original = {
    version: 9,
    progress: { Windmill: { setup, placedPieceIds: ['piece-0-0'], trayOrientations: {}, parkedGroups } },
    history: { Lighthouse: [{ setup, completedAt: '2025-01-01T12:00:00.000Z' }] },
  };
  for (const [missedDropMode, allowLoosePiecesOnBoard] of [['return-to-tray', false], ['park-on-board', true]]) {
    assert.deepEqual(migrateSave({ ...original, settings: { theme: 'Slate', missedDropMode } }), {
      ...original, version: 12, settings: { theme: 'Slate', allowLoosePiecesOnBoard, pickerPreviewSize: 'Full' },
    });
  }
});

test('version 10 defaults the picker layout without changing settings, progress or history', () => {
  const setup = {
    size: { width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 16 },
    seed: 42, connectorStyle: 'classic', animationSpeed: 'Normal', challengeMode: 'none', pieceRotation: false,
  };
  const original = {
    version: 10,
    settings: { theme: 'Slate', trayPosition: 'Right', allowLoosePiecesOnBoard: false },
    progress: { Windmill: { setup, placedPieceIds: ['piece-0-0'], trayOrientations: {}, parkedGroups: [] } },
    history: { Lighthouse: [{ setup, completedAt: '2025-01-01T12:00:00.000Z' }] },
  };
  assert.deepEqual(migrateSave(original), {
    ...original, version: 12, settings: { ...original.settings, pickerPreviewSize: 'Full' },
  });
});

test('version 11 renames either picker layout without changing settings, progress or history', () => {
  const setup = {
    size: { width: 512, height: 288, columns: 4, rows: 2, snapTolerance: 16 },
    seed: 42, connectorStyle: 'classic', animationSpeed: 'Normal', challengeMode: 'none', pieceRotation: false,
  };
  for (const [previousSize, currentSize] of [['Medium', 'Compact'], ['Large', 'Full']]) {
    const original = {
      version: 11,
      settings: { theme: 'Slate', trayPosition: 'Right', pickerPreviewSize: previousSize },
      progress: { Windmill: { setup, placedPieceIds: ['piece-0-0'], trayOrientations: {}, parkedGroups: [] } },
      history: { Lighthouse: [{ setup, completedAt: '2025-01-01T12:00:00.000Z' }] },
    };
    assert.deepEqual(migrateSave(original), {
      ...original, version: 12, settings: { ...original.settings, pickerPreviewSize: currentSize },
    });
  }
});