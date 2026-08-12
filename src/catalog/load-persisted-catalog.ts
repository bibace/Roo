import { storage } from 'wxt/utils/storage';
import { resolveConfigScopes, type ResolvedCatalogScope } from '../domain/resolve-config-scopes';
import { summarizeCatalog, type CatalogSummary } from './catalog-summary';
import { CatalogStorageError } from './catalog-storage-error';
import {
  PERSISTED_CONFIGURATION_STORAGE_KEY,
  validatePersistedCatalog,
  type PersistedConfigurationV1,
} from './persisted-catalog';

export type PersistedCatalogLoadResult =
  | { status: 'empty' }
  | {
      status: 'ready';
      snapshot: PersistedConfigurationV1;
      scopes: ResolvedCatalogScope[];
      summary: CatalogSummary;
    }
  | { status: 'invalid' };

function createReadyResult(snapshot: PersistedConfigurationV1): PersistedCatalogLoadResult {
  const scopes = resolveConfigScopes(snapshot.config);

  return {
    status: 'ready',
    snapshot,
    scopes,
    summary: summarizeCatalog(snapshot.config, scopes),
  };
}

export async function loadPersistedCatalog(): Promise<PersistedCatalogLoadResult> {
  let storedValue: unknown;

  try {
    storedValue = await storage.getItem<unknown>(PERSISTED_CONFIGURATION_STORAGE_KEY);
  } catch {
    throw new CatalogStorageError('FAILED', 'Unable to load configuration.');
  }

  if (storedValue === null || storedValue === undefined) {
    return { status: 'empty' };
  }

  const snapshot = validatePersistedCatalog(storedValue);
  return snapshot ? createReadyResult(snapshot) : { status: 'invalid' };
}
