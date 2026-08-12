import { describe, expect, it } from 'vitest';
import { ConfigImportError } from '../import/config-import-error';
import {
  clearCreatedConfigurationDraft,
  createCurrentConfigurationDraft,
  createNewConfigurationDraft,
  createUploadedConfigurationDraft,
  formatConfigurationDraft,
  prepareConfigurationDraft,
  type ConfigurationDraft,
} from './configuration-draft';

const emptyToken = { kind: 'empty' } as const;

describe('configuration drafts', () => {
  it('creates a valid canonical new configuration', () => {
    const draft = createNewConfigurationDraft(emptyToken);

    expect(draft.origin).toBe('new');
    expect(draft.source).toEqual({ kind: 'created' });
    expect(draft.fileName).toBe('roo.yaml');
    expect(prepareConfigurationDraft(draft).config).toEqual({
      version: 1,
      defaults: { enabled: false, roles: [] },
      projects: {},
    });
  });

  it('discards uploaded YAML comments and formatting', () => {
    const rawSourceText = `# upload comment
version: 1

projects:   {}
`;
    const draft = createUploadedConfigurationDraft('team.yml', rawSourceText, emptyToken);

    expect(draft.origin).toBe('upload');
    expect(draft.fileName).toBe('team.yaml');
    expect(draft.source).toEqual({ kind: 'uploaded', fileName: 'team.yml' });
    expect(draft.sourceText).not.toContain('upload comment');
    expect(draft.sourceText).not.toBe(rawSourceText);
    expect('rawSource' in draft).toBe(false);
    expect('rawSourceText' in draft).toBe(false);
  });

  it('converts uploaded JSON into canonical YAML', () => {
    const rawSourceText = '{"version":1,"projects":{}}';
    const draft = createUploadedConfigurationDraft('team.json', rawSourceText, emptyToken);

    expect(draft.fileName).toBe('team.yaml');
    expect(draft.sourceText).toContain('version: 1');
    expect(draft.sourceText).toContain('projects:\n  {}');
    expect(draft.sourceText).not.toBe(rawSourceText);
    expect(prepareConfigurationDraft(draft).format).toBe('yaml');
  });

  it('opens a current JSON-origin catalog as canonical YAML', () => {
    const draft = createCurrentConfigurationDraft(
      {
        version: 1,
        defaults: { enabled: false, roles: [] },
        projects: {},
      },
      { kind: 'uploaded', fileName: 'current.json' },
      { kind: 'ready', catalogVersion: 3 },
    );

    expect(draft.origin).toBe('edit');
    expect(draft.fileName).toBe('current.yaml');
    expect(draft.sourceText).toContain('version: 1');
    expect(prepareConfigurationDraft(draft).format).toBe('yaml');
  });

  it('opens a created configuration as roo.yaml', () => {
    const draft = createCurrentConfigurationDraft(
      {
        version: 1,
        defaults: { enabled: false, roles: [] },
        projects: {},
      },
      { kind: 'created' },
      { kind: 'ready', catalogVersion: 3 },
    );

    expect(draft.fileName).toBe('roo.yaml');
    expect(draft.source).toEqual({ kind: 'created' });
  });

  it('rejects invalid uploaded source without creating a draft', () => {
    expect(() => createUploadedConfigurationDraft('broken.yaml', 'version: [', emptyToken))
      .toThrow(ConfigImportError);
  });

  it('formats valid YAML while preserving draft metadata', () => {
    const draft: ConfigurationDraft = {
      origin: 'upload',
      fileName: 'team.yaml',
      sourceText: 'version: 1\nprojects: {}\n',
      expectedCatalogToken: emptyToken,
      source: { kind: 'uploaded', fileName: 'team.json' },
      staleState: {
        status: 'needs-review',
        latestCatalogToken: { kind: 'ready', catalogVersion: 2 },
      },
    };

    const formatted = formatConfigurationDraft(draft);

    expect(formatted).toMatchObject({
      origin: draft.origin,
      fileName: draft.fileName,
      expectedCatalogToken: draft.expectedCatalogToken,
      source: draft.source,
      staleState: draft.staleState,
    });
    expect(formatted.sourceText).toContain('defaults:');
    expect(prepareConfigurationDraft(formatted).config.version).toBe(1);
  });

  it('rejects invalid edited YAML', () => {
    const draft: ConfigurationDraft = {
      ...createNewConfigurationDraft(emptyToken),
      sourceText: 'version: [',
    };

    expect(() => prepareConfigurationDraft(draft)).toThrow(ConfigImportError);
  });

  it('clears an existing created draft without changing its identity or token', () => {
    const draft = createCurrentConfigurationDraft(
      {
        version: 1,
        defaults: { enabled: false, roles: [] },
        projects: {
          atlas: {
            accounts: { prod: '111111111111' },
            roles: {},
          },
        },
      },
      { kind: 'created' },
      { kind: 'ready', catalogVersion: 7 },
    );
    const cleared = clearCreatedConfigurationDraft(draft);

    expect(cleared).not.toBe(draft);
    expect(cleared).toMatchObject({
      origin: 'edit',
      source: { kind: 'created' },
      fileName: 'roo.yaml',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 7 },
    });
    expect(prepareConfigurationDraft(cleared).config).toEqual({
      version: 1,
      defaults: { enabled: false, roles: [] },
      projects: {},
    });
    expect(draft.sourceText).not.toBe(cleared.sourceText);
  });

  it.each([
    createNewConfigurationDraft(emptyToken),
    createCurrentConfigurationDraft(
      { version: 1, defaults: { enabled: false, roles: [] }, projects: {} },
      { kind: 'uploaded', fileName: 'roo.yaml' },
      { kind: 'ready', catalogVersion: 1 },
    ),
    createCurrentConfigurationDraft(
      { version: 1, defaults: { enabled: false, roles: [] }, projects: {} },
      { kind: 'uploaded', fileName: 'team.json' },
      { kind: 'ready', catalogVersion: 1 },
    ),
  ])('rejects Clear for unsupported lifecycle draft %#', (draft) => {
    expect(() => clearCreatedConfigurationDraft(draft)).toThrow(
      'Clear is only available for an existing Roo-created configuration.',
    );
  });
});
