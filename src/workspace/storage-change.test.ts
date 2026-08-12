import { describe, expect, it } from 'vitest';
import { PERSISTED_CONFIGURATION_STORAGE_KEY } from '../catalog/persisted-catalog';
import { hasRelevantWorkspaceStorageChange } from './storage-change';

describe('hasRelevantWorkspaceStorageChange', () => {
  it('recognizes configuration v1 with and without the local prefix', () => {
    const key = PERSISTED_CONFIGURATION_STORAGE_KEY;
    expect(hasRelevantWorkspaceStorageChange({ [key]: {} })).toBe(true);
    expect(hasRelevantWorkspaceStorageChange({ [key.replace(/^local:/, '')]: {} })).toBe(true);
  });

  it('rejects former development and unrelated change sets', () => {
    expect(hasRelevantWorkspaceStorageChange({ 'roo-catalog-v4': {} })).toBe(false);
    expect(hasRelevantWorkspaceStorageChange({ 'local:roo-catalog-v3': {} })).toBe(false);
    expect(hasRelevantWorkspaceStorageChange({ unrelated: {} })).toBe(false);
    expect(hasRelevantWorkspaceStorageChange({})).toBe(false);
  });
});
