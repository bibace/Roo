import { describe, expect, it } from 'vitest';
import { prepareConfigImport } from '../import/prepare-config-import';
import type { RooConfigDocument } from './types';
import { getCanonicalYamlFileName, serializeCanonicalYaml } from './canonical-yaml';

const simpleV1: RooConfigDocument = {
  version: 1,
  defaults: {
    enabled: true,
    roles: ['platform/read-only'],
  },
  projects: {
    atlas: {
      accounts: {
        dev: '111111111111',
        prod: '222222222222',
      },
      roles: {
        'platform/admin': { environments: ['prod'] },
      },
    },
  },
};

const simpleV2: RooConfigDocument = {
  ...simpleV1,
  version: 2,
};

const organizationV2: RooConfigDocument = {
  version: 2,
  organizations: {
    engineering: {
      baseAccounts: [
        {
          accountId: '111111111111',
          accountAlias: 'company-a',
        },
      ],
      defaults: {
        enabled: true,
        roles: ['platform/read-only'],
      },
      projects: {
        atlas: {
          accounts: {
            prod: '222222222222',
          },
          roles: {},
        },
      },
    },
  },
};

describe('serializeCanonicalYaml', () => {
  it.each([
    ['simple v1', simpleV1],
    ['simple v2', simpleV2],
  ])('round-trips %s through the existing import pipeline', (_name, config) => {
    const yaml = serializeCanonicalYaml(config);

    expect(prepareConfigImport('roo.yaml', yaml).config).toEqual(config);
  });

  it('round-trips Organization Mode with public snake_case fields', () => {
    const yaml = serializeCanonicalYaml(organizationV2);

    expect(yaml).toContain('organizations:');
    expect(yaml).toContain('base_accounts:');
    expect(yaml).toContain('account_id:');
    expect(yaml).toContain('account_alias:');
    expect(yaml).not.toContain('organisations:');
    expect(yaml).not.toContain('baseAccounts:');
    expect(yaml).not.toContain('accountId:');
    expect(yaml).not.toContain('accountAlias:');
    expect(prepareConfigImport('roo.yaml', yaml).config).toEqual(organizationV2);
  });

  it('produces stable canonical formatting', () => {
    const first = serializeCanonicalYaml(organizationV2);
    const normalized = prepareConfigImport('roo.yaml', first).config;

    expect(serializeCanonicalYaml(normalized)).toBe(first);
  });

  it('uses safe block YAML with no generated anchors or aliases and one final newline', () => {
    const yaml = serializeCanonicalYaml(simpleV1);

    expect(yaml).not.toMatch(/(^|\s)[&*][^\s]+/);
    expect(yaml).toMatch(/\n$/);
    expect(yaml).not.toMatch(/\n\n$/);
    expect(yaml).toContain('roles:\n    - platform/read-only');
  });
});

describe('getCanonicalYamlFileName', () => {
  it.each([
    [undefined, 'roo.yaml'],
    ['foo.yaml', 'foo.yaml'],
    ['foo.yml', 'foo.yaml'],
    ['foo.json', 'foo.yaml'],
    ['CONFIG.JSON', 'CONFIG.yaml'],
  ])('maps %s to %s', (sourceFileName, expected) => {
    expect(getCanonicalYamlFileName(sourceFileName)).toBe(expected);
  });
});
