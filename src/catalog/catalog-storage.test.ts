import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigImportError } from '../import/config-import-error';
import { prepareConfigImport } from '../import/prepare-config-import';

const { getItem, removeItem, setItem } = vi.hoisted(() => ({
  getItem: vi.fn(),
  removeItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('wxt/utils/storage', () => ({
  storage: { getItem, removeItem, setItem },
}));

import { loadPersistedCatalog } from './load-persisted-catalog';
import {
  deletePersistedConfiguration,
  savePersistedCatalog,
} from './catalog-storage';
import { CatalogStorageError } from './catalog-storage-error';
import { PERSISTED_CONFIGURATION_STORAGE_KEY } from './persisted-catalog';

let storedValue: unknown;
let otherStorage: Map<string, unknown>;
const validStoredConfig = {
  version: 1,
  defaults: { enabled: false, roles: [] },
  projects: {},
};

function makeCandidate(fileName: string, accountId: string) {
  return prepareConfigImport(
    fileName,
    JSON.stringify({
      version: 1,
      defaults: { enabled: false },
      projects: { atlas: { accounts: { prod: accountId } } },
    }),
  );
}

describe('configuration storage', () => {
  beforeEach(() => {
    storedValue = null;
    otherStorage = new Map();
    getItem.mockReset();
    removeItem.mockReset();
    setItem.mockReset();
    getItem.mockImplementation(async (key: string) => (
      key === PERSISTED_CONFIGURATION_STORAGE_KEY
        ? storedValue
        : otherStorage.get(key) ?? null
    ));
    setItem.mockImplementation(async (key: string, value: unknown) => {
      if (key === PERSISTED_CONFIGURATION_STORAGE_KEY) {
        storedValue = value;
      }
    });
    removeItem.mockImplementation(async (key: string) => {
      if (key === PERSISTED_CONFIGURATION_STORAGE_KEY) {
        storedValue = undefined;
      } else {
        otherStorage.delete(key);
      }
    });
  });

  it('persists one normalized v1 envelope with created source identity', async () => {
    const candidate = makeCandidate('roo.yaml', '111111111111');
    const snapshot = await savePersistedCatalog(
      candidate,
      { kind: 'created' },
      { kind: 'empty' },
    );

    expect(setItem).toHaveBeenCalledWith(PERSISTED_CONFIGURATION_STORAGE_KEY, snapshot);
    expect(snapshot).toEqual({
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'created' },
      config: candidate.config,
    });
    expect(snapshot).not.toHaveProperty('sourceText');
    expect(snapshot).not.toHaveProperty('targets');
  });

  it('persists the original upload identity independently of canonical YAML', async () => {
    const candidate = makeCandidate('team-config.yaml', '111111111111');

    const snapshot = await savePersistedCatalog(
      candidate,
      { kind: 'uploaded', fileName: 'team-config.json' },
      { kind: 'empty' },
    );

    expect(snapshot.source).toEqual({ kind: 'uploaded', fileName: 'team-config.json' });
    expect(snapshot).not.toHaveProperty('sourceFileName');
    expect(snapshot).not.toHaveProperty('sourceFormat');
  });

  it('keeps the last-known-good configuration until an explicit successful save', async () => {
    const candidateA = makeCandidate('a.yaml', '111111111111');
    const candidateB = makeCandidate('b.yaml', '222222222222');

    const persistedA = await savePersistedCatalog(
      candidateA,
      { kind: 'created' },
      { kind: 'empty' },
    );
    expect(storedValue).toEqual(persistedA);
    expect(() => prepareConfigImport('invalid.json', '{')).toThrowError(ConfigImportError);

    await savePersistedCatalog(
      candidateB,
      { kind: 'uploaded', fileName: 'b.json' },
      { kind: 'ready', catalogVersion: 1 },
    );
    expect(storedValue).toMatchObject({
      source: { kind: 'uploaded', fileName: 'b.json' },
      catalogVersion: 2,
    });
  });

  it('maps a storage load failure before save to FAILED', async () => {
    getItem.mockRejectedValue(new Error('storage failure'));

    await expect(savePersistedCatalog(
      makeCandidate('roo.yaml', '111111111111'),
      { kind: 'created' },
      { kind: 'empty' },
    )).rejects.toMatchObject({
      code: 'FAILED',
      message: 'Unable to save configuration.',
    });
  });

  it('maps a catalog token mismatch to STALE', async () => {
    await savePersistedCatalog(
      makeCandidate('first.yaml', '111111111111'),
      { kind: 'created' },
      { kind: 'empty' },
    );

    await expect(savePersistedCatalog(
      makeCandidate('second.yaml', '222222222222'),
      { kind: 'created' },
      { kind: 'empty' },
    )).rejects.toMatchObject({
      code: 'STALE',
      message: 'Configuration changed in another Roo window. Review and try again.',
    });
  });

  it('maps a storage write failure to FAILED', async () => {
    setItem.mockRejectedValue(new Error('storage failure'));

    await expect(savePersistedCatalog(
      makeCandidate('roo.yaml', '111111111111'),
      { kind: 'created' },
      { kind: 'empty' },
    )).rejects.toBeInstanceOf(CatalogStorageError);
  });

  it('does not write when loading a missing configuration', async () => {
    await expect(loadPersistedCatalog()).resolves.toEqual({ status: 'empty' });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('throws a typed load failure when the storage read rejects', async () => {
    getItem.mockRejectedValue(new Error('storage failure'));

    await expect(loadPersistedCatalog()).rejects.toMatchObject({
      code: 'FAILED',
      message: 'Unable to load configuration.',
    });
  });

  it('revalidates stored normalized configuration and resolves Jump Targets', async () => {
    storedValue = {
      storageVersion: 1,
      catalogVersion: 4,
      source: { kind: 'uploaded', fileName: 'stored.yaml' },
      config: {
        version: 1,
        defaults: { enabled: false },
        projects: {
          ' atlas ': {
            accounts: { ' prod ': '111111111111' },
            roles: { 'data-engineer': {} },
          },
        },
      },
    };

    const result = await loadPersistedCatalog();

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }

    expect(result.snapshot).toMatchObject({
      catalogVersion: 4,
      source: { kind: 'uploaded', fileName: 'stored.yaml' },
    });
    expect(result.scopes[0]?.targets).toMatchObject([
      { accountId: '111111111111', accountName: 'atlas-prod' },
    ]);
    expect(result.summary).toEqual({ projects: 1, accounts: 1, destinations: 1 });
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each([
    {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'uploaded', fileName: '../roo.yaml' },
      config: validStoredConfig,
    },
    {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'uploaded', fileName: 'roo\n.yaml' },
      config: validStoredConfig,
    },
    {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'uploaded', fileName: 'roo.txt' },
      config: validStoredConfig,
    },
    {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'created', fileName: 'roo.yaml' },
      config: validStoredConfig,
    },
    {
      storageVersion: 4,
      catalogVersion: 1,
      sourceFileName: 'roo.yaml',
      sourceFormat: 'yaml',
      config: validStoredConfig,
    },
  ])('rejects invalid or development-only persisted envelopes %#', async (value) => {
    storedValue = value;

    await expect(loadPersistedCatalog()).resolves.toEqual({ status: 'invalid' });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('ignores former development storage keys', async () => {
    await expect(loadPersistedCatalog()).resolves.toEqual({ status: 'empty' });
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).toHaveBeenCalledWith(PERSISTED_CONFIGURATION_STORAGE_KEY);
  });

  it('deletes the authoritative uploaded configuration and subsequent load is empty', async () => {
    await savePersistedCatalog(
      makeCandidate('team.yaml', '111111111111'),
      { kind: 'uploaded', fileName: 'team.json' },
      { kind: 'empty' },
    );

    await deletePersistedConfiguration({ kind: 'ready', catalogVersion: 1 });

    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith(PERSISTED_CONFIGURATION_STORAGE_KEY);
    await expect(loadPersistedCatalog()).resolves.toEqual({ status: 'empty' });
  });

  it('rejects stale delete without removing storage', async () => {
    await savePersistedCatalog(
      makeCandidate('team.yaml', '111111111111'),
      { kind: 'uploaded', fileName: 'team.json' },
      { kind: 'empty' },
    );

    await expect(deletePersistedConfiguration({
      kind: 'ready',
      catalogVersion: 2,
    })).rejects.toMatchObject({
      code: 'STALE',
      message: 'Configuration changed in another Roo window. Review and try again.',
    });
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('maps storage removal failure to FAILED', async () => {
    await savePersistedCatalog(
      makeCandidate('team.yaml', '111111111111'),
      { kind: 'uploaded', fileName: 'team.json' },
      { kind: 'empty' },
    );
    removeItem.mockRejectedValue(new Error('storage failure'));

    await expect(deletePersistedConfiguration({
      kind: 'ready',
      catalogVersion: 1,
    })).rejects.toMatchObject({
      code: 'FAILED',
      message: 'Unable to delete configuration.',
    });
  });

  it('maps a storage read failure before delete to its operation-specific failure', async () => {
    getItem.mockRejectedValue(new Error('storage failure'));

    await expect(deletePersistedConfiguration({
      kind: 'ready',
      catalogVersion: 1,
    })).rejects.toMatchObject({
      code: 'FAILED',
      message: 'Unable to delete configuration.',
    });
  });

  it('leaves former catalog and Local Account keys byte-for-byte unchanged', async () => {
    const markers = new Map<string, unknown>([
      ['local:roo-catalog-v1', { marker: 'v1' }],
      ['local:roo-catalog-v2', { marker: 'v2' }],
      ['local:roo-catalog-v3', { marker: 'v3' }],
      ['local:roo-catalog-v4', { marker: 'v4' }],
      ['local:roo-local-accounts-v3', { marker: 'accounts' }],
    ]);
    otherStorage = new Map(markers);
    await savePersistedCatalog(
      makeCandidate('team.yaml', '111111111111'),
      { kind: 'uploaded', fileName: 'team.json' },
      { kind: 'empty' },
    );

    await deletePersistedConfiguration({ kind: 'ready', catalogVersion: 1 });

    expect(otherStorage).toEqual(markers);
    expect(removeItem).toHaveBeenCalledWith(PERSISTED_CONFIGURATION_STORAGE_KEY);
  });
});
