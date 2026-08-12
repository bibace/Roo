import { describe, expect, it } from 'vitest';
import { ConfigImportError } from './config-import-error';
import { prepareConfigImport } from './prepare-config-import';

const CANONICAL_YAML = `version: 1

defaults:
  enabled: true
  roles:
    - platform/security-readonly
    - platform/security-admin

projects:
  atlas:
    accounts:
      dev: "111111111111"
      staging: "222222222222"
      prod: "333333333333"

    roles:
      data-engineer:
        environments:
          - staging
          - prod
`;

const CANONICAL_CONFIG = {
  version: 1,
  defaults: {
    enabled: true,
    roles: ['platform/security-readonly', 'platform/security-admin'],
  },
  projects: {
    atlas: {
      accounts: {
        dev: '111111111111',
        staging: '222222222222',
        prod: '333333333333',
      },
      roles: {
        'data-engineer': {
          environments: ['staging', 'prod'],
        },
      },
    },
  },
};

function expectImportError(action: () => unknown, code: ConfigImportError['code']): ConfigImportError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigImportError);
    expect(error).toMatchObject({ code });
    return error as ConfigImportError;
  }

  throw new Error(`Expected ${code} error.`);
}

describe('prepareConfigImport', () => {
  it('accepts supported file extensions case-insensitively', () => {
    expect(prepareConfigImport('ROO.YAML', CANONICAL_YAML).format).toBe('yaml');
    expect(prepareConfigImport('roo.yml', CANONICAL_YAML).format).toBe('yaml');
    expect(prepareConfigImport('Roo.Json', JSON.stringify(CANONICAL_CONFIG)).format).toBe('json');
  });

  it('rejects unsupported extensions before parsing', () => {
    expectImportError(() => prepareConfigImport('roo.txt', '{'), 'UNSUPPORTED_FILE_TYPE');
  });

  it('selects the parser from the extension only', () => {
    expectImportError(() => prepareConfigImport('roo.json', 'version: 1'), 'PARSE_FAILED');

    const candidate = prepareConfigImport('roo.yaml', JSON.stringify(CANONICAL_CONFIG));
    expect(candidate.format).toBe('yaml');
  });

  it('prepares v2 Simple and Organization documents without flattening scopes', () => {
    const simple = prepareConfigImport(
      'simple.json',
      JSON.stringify({
        version: 2,
        projects: { atlas: { accounts: { prod: '111111111111' }, roles: { 'platform/read-only': {} } } },
      }),
    );
    const organization = prepareConfigImport(
      'organizations.json',
      JSON.stringify({
        version: 2,
        organisations: {
          engineering: {
            base_accounts: [{ account_id: '222222222222', account_alias: 'engineering-root' }],
            projects: { atlas: { accounts: { prod: '222222222223' }, roles: { 'platform/engineering-readonly': {} } } },
          },
          corporate: {
            base_accounts: [{ account_id: '333333333333' }],
            projects: { atlas: { accounts: { prod: '333333333334' }, roles: { 'platform/corporate-readonly': {} } } },
          },
        },
      }),
    );

    expect(simple.config.version).toBe(2);
    expect(simple.scopes).toHaveLength(1);
    expect(simple.scopes[0]).toMatchObject({ kind: 'simple', targets: [{ accountId: '111111111111' }] });
    expect(simple.summary).toEqual({ projects: 1, accounts: 1, destinations: 1 });

    expect(organization.config).toHaveProperty('organizations');
    expect(organization.scopes.map((scope) => scope.kind)).toEqual(['organization', 'organization']);
    expect(organization.scopes
      .filter((scope) => scope.kind === 'organization')
      .map((scope) => scope.organizationId)).toEqual(['corporate', 'engineering']);
    expect(organization.scopes.flatMap((scope) => scope.targets.map((target) => target.accountId))).toEqual([
      '333333333334',
      '222222222223',
    ]);
    expect(organization.summary).toEqual({ projects: 2, accounts: 2, destinations: 2 });
  });

  it('accepts valid Roo JSON', () => {
    const candidate = prepareConfigImport('roo.json', JSON.stringify(CANONICAL_CONFIG));

    expect(candidate.config).toEqual(CANONICAL_CONFIG);
    expect(candidate.summary).toEqual({ projects: 1, accounts: 3, destinations: 8 });
    expect(candidate).not.toHaveProperty('sourceText');
  });

  it('treats omitted defaults as no configuration default targets', () => {
    const candidate = prepareConfigImport(
      'roo.json',
      JSON.stringify({
        version: 1,
        projects: { atlas: { accounts: { prod: '111111111111' } } },
      }),
    );

    expect(candidate.config).toMatchObject({ defaults: { enabled: false, roles: [] } });
    expect(candidate.scopes[0]?.targets).toEqual([]);
    expect(candidate.summary).toEqual({ projects: 1, accounts: 1, destinations: 0 });
  });

  it('rejects malformed JSON as PARSE_FAILED', () => {
    expectImportError(() => prepareConfigImport('roo.json', '{"version": 1'), 'PARSE_FAILED');
  });

  it('rejects valid JSON with an invalid Roo Config as VALIDATION_FAILED', () => {
    const error = expectImportError(
      () => prepareConfigImport(
        'roo.json',
        JSON.stringify({ version: 1, projects: { atlas: { accounts: { prod: 'not-an-account' } } } }),
      ),
      'VALIDATION_FAILED',
    );

    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]).toEqual({
      path: 'projects.atlas.accounts.prod',
      message: expect.any(String),
    });
  });

  it('accepts the canonical Roo YAML', () => {
    const candidate = prepareConfigImport('roo.yaml', CANONICAL_YAML);

    expect(candidate.config).toEqual(CANONICAL_CONFIG);
    expect(candidate.scopes[0]?.targets).toHaveLength(8);
  });

  it('rejects malformed YAML as PARSE_FAILED', () => {
    expectImportError(() => prepareConfigImport('roo.yaml', 'version: [1'), 'PARSE_FAILED');
  });

  it('rejects multiple YAML documents', () => {
    expectImportError(
      () => prepareConfigImport('roo.yaml', `${CANONICAL_YAML}\n---\nversion: 1\n`),
      'PARSE_FAILED',
    );
  });

  it('rejects duplicate YAML mapping keys', () => {
    expectImportError(
      () => prepareConfigImport('roo.yaml', 'version: 1\nprojects:\n  atlas: {}\nprojects:\n  nova: {}\n'),
      'PARSE_FAILED',
    );
  });

  it('rejects YAML aliases', () => {
    expectImportError(
      () => prepareConfigImport('roo.yaml', 'version: 1\nprojects: &catalog {}\nalias: *catalog\n'),
      'PARSE_FAILED',
    );
  });

  it('rejects YAML custom tags and !include', () => {
    expectImportError(
      () => prepareConfigImport('roo.yaml', 'version: 1\nprojects: !custom {}\n'),
      'PARSE_FAILED',
    );
    expectImportError(
      () => prepareConfigImport('roo.yaml', 'version: 1\nprojects: !include roo.yaml\n'),
      'PARSE_FAILED',
    );
  });

  it('rejects valid YAML with an invalid Roo Config as VALIDATION_FAILED', () => {
    const error = expectImportError(
      () => prepareConfigImport(
        'roo.yaml',
        'version: 1\nprojects:\n  atlas:\n    accounts:\n      prod: not-an-account\n',
      ),
      'VALIDATION_FAILED',
    );

    expect(error.issues.length).toBeGreaterThan(0);
  });

  it('produces equivalent normalized configs and targets for YAML and JSON', () => {
    const yamlCandidate = prepareConfigImport('roo.yaml', CANONICAL_YAML);
    const jsonCandidate = prepareConfigImport('roo.json', JSON.stringify(CANONICAL_CONFIG));

    expect(yamlCandidate.config).toEqual(jsonCandidate.config);
    expect(yamlCandidate.scopes).toEqual(jsonCandidate.scopes);
  });

  it('gives YAML and JSON omitted defaults the same neutral meaning', () => {
    const yamlCandidate = prepareConfigImport(
      'roo.yaml',
      'version: 1\nprojects:\n  atlas:\n    accounts:\n      prod: "111111111111"\n',
    );
    const jsonCandidate = prepareConfigImport(
      'roo.json',
      JSON.stringify({
        version: 1,
        projects: { atlas: { accounts: { prod: '111111111111' } } },
      }),
    );

    expect(yamlCandidate.config).toEqual(jsonCandidate.config);
    expect(yamlCandidate.config).toMatchObject({ defaults: { enabled: false, roles: [] } });
    expect(yamlCandidate.scopes[0]?.targets).toEqual([]);
  });
});
