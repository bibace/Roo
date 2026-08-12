import { describe, expect, it, vi } from 'vitest';
import { summarizeCatalog } from '../catalog/catalog-summary';
import { CatalogStorageError } from '../catalog/catalog-storage-error';
import type { PersistedCatalogLoadResult } from '../catalog/load-persisted-catalog';
import { createPersistedCatalog } from '../catalog/persisted-catalog';
import { resolveConfigScopes } from '../domain/resolve-config-scopes';
import { prepareConfigImport } from '../import/prepare-config-import';
import type { WorkspaceRequest } from './protocol';
import type { CatalogMutationToken } from './types';
import { WorkspaceCoordinator, type WorkspacePersistence } from './coordinator';

interface MemoryStore {
  catalog: PersistedCatalogLoadResult;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createMemoryPersistence(): { store: MemoryStore; persistence: WorkspacePersistence } {
  const store: MemoryStore = { catalog: { status: 'empty' } };
  const persistence: WorkspacePersistence = {
    loadCatalog: async () => store.catalog,
    saveCatalog: async (candidate, source) => {
      const catalogVersion = store.catalog.status === 'ready'
        ? store.catalog.snapshot.catalogVersion + 1
        : 1;
      const snapshot = createPersistedCatalog(candidate, source, catalogVersion);
      const scopes = resolveConfigScopes(snapshot.config);
      store.catalog = {
        status: 'ready',
        snapshot,
        scopes,
        summary: summarizeCatalog(snapshot.config, scopes),
      };
    },
    deleteConfiguration: async () => {
      store.catalog = { status: 'empty' };
    },
  };

  return { store, persistence };
}

function makeImport(
  fileName = 'roo.yaml',
  accountId = '111111111111',
  project = 'atlas',
) {
  return prepareConfigImport(fileName, `version: 1\nprojects:\n  ${project}:\n    accounts:\n      prod: '${accountId}'\n    roles:\n      platform/read-only: {}\n`);
}

function validImportRequest(
  candidate: ReturnType<typeof makeImport>,
  expectedCatalogToken: CatalogMutationToken,
): Extract<WorkspaceRequest, { type: 'IMPORT_CATALOG' }> {
  return {
    type: 'IMPORT_CATALOG',
    expectedCatalogToken,
    source: { kind: 'uploaded', fileName: candidate.fileName },
    fileName: candidate.fileName,
    sourceText: JSON.stringify(candidate.config),
  };
}

function readyCatalog(
  candidate: ReturnType<typeof makeImport>,
  catalogVersion: number,
  sourceFileName = candidate.fileName,
) {
  const snapshot = createPersistedCatalog(
    candidate,
    { kind: 'uploaded', fileName: sourceFileName },
    catalogVersion,
  );
  const scopes = resolveConfigScopes(snapshot.config);
  return {
    status: 'ready' as const,
    snapshot,
    scopes,
    summary: summarizeCatalog(snapshot.config, scopes),
  };
}

describe('WorkspaceCoordinator', () => {
  it('loads the catalog once for a cold GET', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.loadCatalog = vi.fn(persistence.loadCatalog);
    const coordinator = new WorkspaceCoordinator(persistence);

    await coordinator.handle({ type: 'GET_WORKSPACE' });

    expect(persistence.loadCatalog).toHaveBeenCalledTimes(1);
  });

  it('uses WorkspaceSnapshotCache for a warm GET', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.loadCatalog = vi.fn(persistence.loadCatalog);
    const coordinator = new WorkspaceCoordinator(persistence);

    const first = await coordinator.handle({ type: 'GET_WORKSPACE' });
    const second = await coordinator.handle({ type: 'GET_WORKSPACE' });

    expect(second).toBe(first);
    expect(persistence.loadCatalog).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent cold GET requests', async () => {
    const catalogLoad = deferred<PersistedCatalogLoadResult>();
    const loadCatalog = vi.fn(() => catalogLoad.promise);
    const coordinator = new WorkspaceCoordinator({
      loadCatalog,
      saveCatalog: vi.fn(),
      deleteConfiguration: vi.fn(),
    });

    const first = coordinator.handle({ type: 'GET_WORKSPACE' });
    const second = coordinator.handle({ type: 'GET_WORKSPACE' });
    await Promise.resolve();
    catalogLoad.resolve({ status: 'empty' });

    const results = await Promise.all([first, second]);

    expect(results[1]).toBe(results[0]);
    expect(loadCatalog).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cache when catalog storage changes', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.loadCatalog = vi.fn(persistence.loadCatalog);
    const coordinator = new WorkspaceCoordinator(persistence);

    await coordinator.handle({ type: 'GET_WORKSPACE' });
    coordinator.invalidateWorkspaceCache();
    await coordinator.handle({ type: 'GET_WORKSPACE' });

    expect(persistence.loadCatalog).toHaveBeenCalledTimes(2);
  });

  it('uses authoritative persisted catalog state for IMPORT_CATALOG', async () => {
    const { persistence, store } = createMemoryPersistence();
    const coordinator = new WorkspaceCoordinator(persistence);
    await coordinator.handle({ type: 'GET_WORKSPACE' });

    const existing = makeImport('existing.yaml', '111111111111');
    store.catalog = readyCatalog(existing, 1);
    const next = makeImport('next.yaml', '222222222222', 'nova');
    const request = validImportRequest(next, {
      kind: 'ready',
      catalogVersion: 1,
    });
    request.source = { kind: 'uploaded', fileName: 'next.json' };

    const result = await coordinator.handle(request);

    expect(result.catalogToken).toEqual({ kind: 'ready', catalogVersion: 2 });
    expect(result.catalog.source).toEqual({ kind: 'uploaded', fileName: 'next.json' });
    expect(result.targets[0]?.accountId).toBe('222222222222');
  });

  it('accepts created source only with the roo.yaml editor filename', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.saveCatalog = vi.fn(persistence.saveCatalog);
    const coordinator = new WorkspaceCoordinator(persistence);
    const request = validImportRequest(makeImport(), { kind: 'empty' });
    request.source = { kind: 'created' };

    await coordinator.handle(request);

    expect(persistence.saveCatalog).toHaveBeenCalledWith(
      expect.anything(),
      { kind: 'created' },
      { kind: 'empty' },
    );
  });

  it('rejects created source with a non-roo.yaml editor filename before save', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.saveCatalog = vi.fn(persistence.saveCatalog);
    const coordinator = new WorkspaceCoordinator(persistence);
    const request = validImportRequest(makeImport('team.yaml'), { kind: 'empty' });
    request.source = { kind: 'created' };

    await expect(coordinator.handle(request)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: 'Configuration source metadata is invalid.',
    });
    expect(persistence.saveCatalog).not.toHaveBeenCalled();
  });

  it('accepts an original JSON upload identity with its canonical YAML editor filename', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.saveCatalog = vi.fn(persistence.saveCatalog);
    const coordinator = new WorkspaceCoordinator(persistence);
    const request = validImportRequest(makeImport('team.yaml'), { kind: 'empty' });
    request.source = { kind: 'uploaded', fileName: 'team.json' };

    await coordinator.handle(request);

    expect(persistence.saveCatalog).toHaveBeenCalledWith(
      expect.anything(),
      { kind: 'uploaded', fileName: 'team.json' },
      { kind: 'empty' },
    );
  });

  it('accepts an original yml upload identity with its canonical YAML editor filename', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.saveCatalog = vi.fn(persistence.saveCatalog);
    const coordinator = new WorkspaceCoordinator(persistence);
    const request = validImportRequest(makeImport('team.yaml'), { kind: 'empty' });
    request.source = { kind: 'uploaded', fileName: 'team.yml' };

    await coordinator.handle(request);

    expect(persistence.saveCatalog).toHaveBeenCalled();
  });

  it('rejects unrelated uploaded source and editor filenames before save', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.saveCatalog = vi.fn(persistence.saveCatalog);
    const coordinator = new WorkspaceCoordinator(persistence);
    const request = validImportRequest(makeImport('other.yaml'), { kind: 'empty' });
    request.source = { kind: 'uploaded', fileName: 'team.json' };

    await expect(coordinator.handle(request)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: 'Configuration source metadata is invalid.',
    });
    expect(persistence.saveCatalog).not.toHaveBeenCalled();
  });

  it('rejects an import with a stale catalog token', async () => {
    const { persistence, store } = createMemoryPersistence();
    const coordinator = new WorkspaceCoordinator(persistence);
    store.catalog = readyCatalog(makeImport('current.yaml'), 2);

    await expect(
      coordinator.handle(validImportRequest(makeImport('stale.yaml', '222222222222'), { kind: 'ready', catalogVersion: 1 })),
    ).rejects.toMatchObject({
      code: 'STALE_WORKSPACE',
      message: 'Configuration changed in another Roo window. Review and try again.',
    });
  });

  it('replaces the cache with the authoritative Workspace after import', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.loadCatalog = vi.fn(persistence.loadCatalog);
    const coordinator = new WorkspaceCoordinator(persistence);
    await coordinator.handle({ type: 'GET_WORKSPACE' });

    const result = await coordinator.handle(validImportRequest(makeImport(), { kind: 'empty' }));
    const cached = await coordinator.handle({ type: 'GET_WORKSPACE' });

    expect(cached).toBe(result);
    expect(persistence.loadCatalog).toHaveBeenCalledTimes(3);
  });

  it('maps typed catalog storage failures without inspecting their messages', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.saveCatalog = async () => {
      throw new CatalogStorageError('FAILED', 'storage detail');
    };
    const coordinator = new WorkspaceCoordinator(persistence);

    await expect(
      coordinator.handle(validImportRequest(makeImport(), { kind: 'empty' })),
    ).rejects.toMatchObject({ code: 'STORAGE_FAILED', message: 'storage detail' });
  });

  it('maps a storage read rejection during GET to STORAGE_FAILED instead of invalid Configuration', async () => {
    const { persistence } = createMemoryPersistence();
    persistence.loadCatalog = async () => {
      throw new CatalogStorageError('FAILED', 'Unable to load configuration.');
    };
    const coordinator = new WorkspaceCoordinator(persistence);

    await expect(coordinator.handle({ type: 'GET_WORKSPACE' })).rejects.toMatchObject({
      code: 'STORAGE_FAILED',
      message: 'Unable to load configuration.',
    });
  });

  it('deletes an uploaded configuration using its exact original filename', async () => {
    const { persistence, store } = createMemoryPersistence();
    persistence.deleteConfiguration = vi.fn(persistence.deleteConfiguration);
    store.catalog = readyCatalog(makeImport('team.yaml'), 3, 'team.json');
    const coordinator = new WorkspaceCoordinator(persistence);

    const result = await coordinator.handle({
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 3 },
      confirmationFileName: 'team.json',
    });

    expect(persistence.deleteConfiguration).toHaveBeenCalledWith({
      kind: 'ready',
      catalogVersion: 3,
    });
    expect(result).toMatchObject({
      status: 'empty',
      catalogToken: { kind: 'empty' },
      catalog: { status: 'empty' },
      targets: [],
      organizations: [],
    });
  });

  it('rejects a canonical filename in place of the original upload filename', async () => {
    const { persistence, store } = createMemoryPersistence();
    persistence.deleteConfiguration = vi.fn(persistence.deleteConfiguration);
    store.catalog = readyCatalog(makeImport('team.yaml'), 3, 'team.json');
    const coordinator = new WorkspaceCoordinator(persistence);

    await expect(coordinator.handle({
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 3 },
      confirmationFileName: 'team.yaml',
    })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: 'Confirmation filename does not match the uploaded configuration.',
    });
    expect(persistence.deleteConfiguration).not.toHaveBeenCalled();
  });

  it('deletes an uploaded roo.yaml without treating it as created', async () => {
    const { persistence, store } = createMemoryPersistence();
    persistence.deleteConfiguration = vi.fn(persistence.deleteConfiguration);
    store.catalog = readyCatalog(makeImport('roo.yaml'), 2);
    const coordinator = new WorkspaceCoordinator(persistence);

    await coordinator.handle({
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 2 },
      confirmationFileName: 'roo.yaml',
    });

    expect(persistence.deleteConfiguration).toHaveBeenCalledTimes(1);
  });

  it('rejects delete for a Roo-created roo.yaml', async () => {
    const { persistence, store } = createMemoryPersistence();
    persistence.deleteConfiguration = vi.fn(persistence.deleteConfiguration);
    const candidate = makeImport('roo.yaml');
    const snapshot = createPersistedCatalog(candidate, { kind: 'created' }, 2);
    const scopes = resolveConfigScopes(snapshot.config);
    store.catalog = {
      status: 'ready',
      snapshot,
      scopes,
      summary: summarizeCatalog(snapshot.config, scopes),
    };
    const coordinator = new WorkspaceCoordinator(persistence);

    await expect(coordinator.handle({
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 2 },
      confirmationFileName: 'roo.yaml',
    })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: 'Roo-created configuration cannot be deleted.',
    });
    expect(persistence.deleteConfiguration).not.toHaveBeenCalled();
  });

  it('rejects stale delete without calling persistence delete', async () => {
    const { persistence, store } = createMemoryPersistence();
    persistence.deleteConfiguration = vi.fn(persistence.deleteConfiguration);
    store.catalog = readyCatalog(makeImport('team.yaml'), 2, 'team.json');
    const coordinator = new WorkspaceCoordinator(persistence);

    await expect(coordinator.handle({
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 1 },
      confirmationFileName: 'team.json',
    })).rejects.toMatchObject({ code: 'STALE_WORKSPACE' });
    expect(persistence.deleteConfiguration).not.toHaveBeenCalled();
  });

  it('replaces the cached Workspace with authoritative empty state after delete', async () => {
    const { persistence, store } = createMemoryPersistence();
    persistence.loadCatalog = vi.fn(persistence.loadCatalog);
    store.catalog = readyCatalog(makeImport('team.yaml'), 1, 'team.json');
    const coordinator = new WorkspaceCoordinator(persistence);
    await coordinator.handle({ type: 'GET_WORKSPACE' });

    const result = await coordinator.handle({
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 1 },
      confirmationFileName: 'team.json',
    });
    const cached = await coordinator.handle({ type: 'GET_WORKSPACE' });

    expect(cached).toBe(result);
    expect(cached.catalog.status).toBe('empty');
  });
});
