import { PERSISTED_CONFIGURATION_STORAGE_KEY } from '../catalog/persisted-catalog';

const relevantStorageKeys = new Set([
  PERSISTED_CONFIGURATION_STORAGE_KEY,
  PERSISTED_CONFIGURATION_STORAGE_KEY.replace(/^local:/, ''),
]);

export function hasRelevantWorkspaceStorageChange(
  changes: Record<string, unknown>,
): boolean {
  return Object.keys(changes).some((key) => relevantStorageKeys.has(key));
}
