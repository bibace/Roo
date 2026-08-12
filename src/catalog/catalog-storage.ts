import { storage } from 'wxt/utils/storage';
import type { ConfigImportCandidate } from '../import/prepare-config-import';
import type { CatalogMutationToken } from '../workspace/types';
import { loadPersistedCatalog } from './load-persisted-catalog';
import {
  createPersistedCatalog,
  PERSISTED_CONFIGURATION_STORAGE_KEY,
  type ConfigurationSourceIdentity,
  type PersistedConfigurationV1,
} from './persisted-catalog';
import { CatalogStorageError } from './catalog-storage-error';

function isSameCatalogToken(
  result: Awaited<ReturnType<typeof loadPersistedCatalog>>,
  expected: CatalogMutationToken,
): boolean {
  if (result.status === 'ready' && expected.kind === 'ready') {
    return result.snapshot.catalogVersion === expected.catalogVersion;
  }

  return result.status === expected.kind;
}

export async function savePersistedCatalog(
  candidate: ConfigImportCandidate,
  source: ConfigurationSourceIdentity,
  expectedCatalogToken: CatalogMutationToken = { kind: 'empty' },
): Promise<PersistedConfigurationV1> {
  let current: Awaited<ReturnType<typeof loadPersistedCatalog>>;

  try {
    current = await loadPersistedCatalog();
  } catch {
    throw new CatalogStorageError('FAILED', 'Unable to save configuration.');
  }

  if (!isSameCatalogToken(current, expectedCatalogToken)) {
    throw new CatalogStorageError(
      'STALE',
      'Configuration changed in another Roo window. Review and try again.',
    );
  }

  const catalogVersion = current.status === 'ready' ? current.snapshot.catalogVersion + 1 : 1;
  const snapshot = createPersistedCatalog(candidate, source, catalogVersion);

  try {
    await storage.setItem(PERSISTED_CONFIGURATION_STORAGE_KEY, snapshot);
  } catch {
    throw new CatalogStorageError('FAILED', 'Unable to save configuration.');
  }

  return snapshot;
}

export async function deletePersistedConfiguration(
  expectedCatalogToken: Extract<CatalogMutationToken, { kind: 'ready' }>,
): Promise<void> {
  let current: Awaited<ReturnType<typeof loadPersistedCatalog>>;

  try {
    current = await loadPersistedCatalog();
  } catch {
    throw new CatalogStorageError('FAILED', 'Unable to delete configuration.');
  }

  if (!isSameCatalogToken(current, expectedCatalogToken)) {
    throw new CatalogStorageError(
      'STALE',
      'Configuration changed in another Roo window. Review and try again.',
    );
  }

  try {
    await storage.removeItem(PERSISTED_CONFIGURATION_STORAGE_KEY);
  } catch {
    throw new CatalogStorageError('FAILED', 'Unable to delete configuration.');
  }
}
