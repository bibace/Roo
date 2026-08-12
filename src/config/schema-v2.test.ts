import { describe, expect, it } from 'vitest';
import {
  normalizeRooConfig,
  normalizeRooConfigDocument,
  normalizeRooConfigV2,
} from './schema';

const validSimpleProject = {
  atlas: {
    accounts: {
      dev: '111111111111',
      prod: '111111111112',
    },
  },
};

interface BaseAccountInput {
  account_id: string;
  account_alias?: string;
}

interface ProjectInput {
  accounts: Record<string, string>;
  roles?: Record<string, { environments?: string[] }>;
}

function makeOrganization(
  baseAccounts: BaseAccountInput[] = [
    { account_id: '222222222222', account_alias: 'company-b' },
  ],
  projects: Record<string, ProjectInput> = {
    atlas: {
      accounts: { prod: '222222222223' },
    },
  },
) {
  return {
    base_accounts: baseAccounts,
    projects,
  };
}

describe('Roo Config v2 schema', () => {
  it('normalizes the shared config document boundary for v1 and v2 Simple documents', () => {
    expect(normalizeRooConfigDocument({
      version: 1,
      projects: validSimpleProject,
    })).toMatchObject({
      version: 1,
      defaults: { enabled: false, roles: [] },
    });

    expect(normalizeRooConfigDocument({
      version: 2,
      projects: validSimpleProject,
    })).toMatchObject({
      version: 2,
      defaults: { enabled: false, roles: [] },
    });
  });

  it('normalizes both organization spellings through the shared document boundary', () => {
    const fromOrganizations = normalizeRooConfigDocument({
      version: 2,
      organizations: { engineering: makeOrganization() },
    });
    const fromOrganisations = normalizeRooConfigDocument({
      version: 2,
      organisations: { engineering: makeOrganization() },
    });

    expect(fromOrganizations).toEqual(fromOrganisations);
    expect(fromOrganisations).toHaveProperty('organizations.engineering');
    expect(fromOrganisations).not.toHaveProperty('organisations');
  });

  it('accepts and normalizes Simple Mode', () => {
    expect(
      normalizeRooConfigV2({
        version: 2,
        projects: validSimpleProject,
      }),
    ).toEqual({
      version: 2,
      defaults: { enabled: false, roles: [] },
      projects: {
        atlas: {
          accounts: validSimpleProject.atlas.accounts,
          roles: {},
        },
      },
    });
  });

  it('normalizes omitted Simple Mode defaults', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      projects: { atlas: { accounts: { prod: '111111111111' } } },
    });

    if (!('projects' in config)) {
      throw new Error('Expected Simple Mode.');
    }

    expect(config.defaults).toEqual({ enabled: false, roles: [] });
  });

  it('accepts explicit Simple Mode roles', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      defaults: { roles: ['platform/example-readonly'] },
      projects: validSimpleProject,
    });

    if (!('projects' in config)) {
      throw new Error('Expected Simple Mode.');
    }

    expect(config.defaults).toEqual({
      enabled: true,
      roles: ['platform/example-readonly'],
    });
  });

  it('accepts organizations and normalizes the domain names', () => {
    expect(
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          ' engineering ': {
            base_accounts: [
              { account_id: '222222222222', account_alias: 'company-b' },
              { account_id: '222222222223' },
            ],
            projects: {
              ' atlas ': {
                accounts: { ' prod ': '222222222224' },
              },
            },
          },
        },
      }),
    ).toEqual({
      version: 2,
      organizations: {
        engineering: {
          baseAccounts: [
            { accountId: '222222222222', accountAlias: 'company-b' },
            { accountId: '222222222223' },
          ],
          defaults: { enabled: false, roles: [] },
          projects: {
            atlas: {
              accounts: { prod: '222222222224' },
              roles: {},
            },
          },
        },
      },
    });
  });

  it('accepts organisations input and normalizes it to organizations', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organisations: { engineering: makeOrganization() },
    });

    if (!('organizations' in config)) {
      throw new Error('Expected Organization Mode.');
    }

    expect(config).toHaveProperty('organizations.engineering');
    expect(config).not.toHaveProperty('organisations');
  });

  it.each([
    { projects: validSimpleProject, organizations: { engineering: makeOrganization() } },
    { projects: validSimpleProject, organisations: { engineering: makeOrganization() } },
    {
      organizations: { engineering: makeOrganization() },
      organisations: { corporate: makeOrganization() },
    },
  ])('rejects incompatible top-level shapes: %j', (shape) => {
    expect(() => normalizeRooConfigV2({ version: 2, ...shape })).toThrow();
  });

  it('rejects top-level defaults in Organization Mode', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        defaults: { roles: ['platform/example-readonly'] },
        organizations: { engineering: makeOrganization() },
      }),
    ).toThrow();
  });

  it('rejects organization-shaped version 1 documents', () => {
    expect(() =>
      normalizeRooConfig({
        version: 1,
        organizations: { engineering: makeOrganization() },
      }),
    ).toThrow();

    expect(() =>
      normalizeRooConfig({
        version: 1,
        organisations: { engineering: makeOrganization() },
      }),
    ).toThrow();
  });

  it('normalizes omitted organization defaults', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: { engineering: makeOrganization() },
    });

    if (!('organizations' in config)) {
      throw new Error('Expected Organization Mode.');
    }

    expect(config.organizations.engineering?.defaults).toEqual({
      enabled: false,
      roles: [],
    });
  });

  it('rejects empty or missing base_accounts', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: { engineering: { ...makeOrganization(), base_accounts: [] } },
      }),
    ).toThrow();

    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: {
            projects: { atlas: { accounts: { prod: '222222222223' } } },
          },
        },
      }),
    ).toThrow();
  });

  it('rejects invalid base account IDs and aliases', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '22222222222' }]),
        },
      }),
    ).toThrow();

    for (const accountAlias of ['Abc', 'ab', 'abc_', '-abc', 'abc-', 'abc def']) {
      expect(() =>
        normalizeRooConfigV2({
          version: 2,
          organizations: {
            engineering: makeOrganization([{ account_id: '222222222222', account_alias: accountAlias }]),
          },
        }),
      ).toThrow();
    }
  });

  it('rejects duplicate base IDs within and across organizations', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([
            { account_id: '222222222222' },
            { account_id: '222222222222' },
          ]),
        },
      }),
    ).toThrow();

    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '222222222222' }]),
          corporate: makeOrganization([{ account_id: '222222222222' }]),
        },
      }),
    ).toThrow();
  });

  it('rejects duplicate base aliases within and across organizations', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([
            { account_id: '222222222222', account_alias: 'company-b' },
            { account_id: '222222222223', account_alias: 'company-b' },
          ]),
        },
      }),
    ).toThrow();

    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '222222222222', account_alias: 'company-b' }]),
          corporate: makeOrganization([{ account_id: '222222222223', account_alias: 'company-b' }]),
        },
      }),
    ).toThrow();
  });

  it('rejects duplicate project account IDs within and across organizations', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '222222222222' }], {
            atlas: { accounts: { dev: '222222222223', prod: '222222222223' } },
          }),
        },
      }),
    ).toThrow();

    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '222222222222' }], {
            atlas: { accounts: { prod: '222222222223' } },
          }),
          corporate: makeOrganization([{ account_id: '333333333333' }], {
            atlas: { accounts: { prod: '222222222223' } },
          }),
        },
      }),
    ).toThrow();
  });

  it('allows a base account to be explicitly declared as a project account in the same organization', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '222222222222' }], {
            platform: { accounts: { base: '222222222222' } },
          }),
        },
      }),
    ).not.toThrow();
  });

  it('rejects a base ID from one organization used by a project in another', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '222222222222' }]),
          corporate: makeOrganization([{ account_id: '333333333333' }], {
            atlas: { accounts: { prod: '222222222222' } },
          }),
        },
      }),
    ).toThrow();
  });

  it('allows the same generated account name in different organizations', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '222222222222' }], {
            atlas: { accounts: { prod: '222222222223' } },
          }),
          corporate: makeOrganization([{ account_id: '333333333333' }], {
            atlas: { accounts: { prod: '333333333334' } },
          }),
        },
      }),
    ).not.toThrow();
  });

  it('rejects generated account-name collisions inside one organization', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '222222222222' }], {
            'a-b': { accounts: { c: '222222222223' } },
            a: { accounts: { 'b-c': '222222222224' } },
          }),
        },
      }),
    ).toThrow();
  });

  it('rejects unknown role environments', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '222222222222' }], {
            atlas: {
              accounts: { dev: '222222222223' },
              roles: { 'platform/example-readonly': { environments: ['prod'] } },
            },
          }),
        },
      }),
    ).toThrow();
  });

  it('rejects organization-key collisions after normalization', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([{ account_id: '222222222222' }]),
          ' engineering ': makeOrganization([{ account_id: '333333333333' }]),
        },
      }),
    ).toThrow();
  });

  it('rejects unknown fields at the base-account boundary', () => {
    expect(() =>
      normalizeRooConfigV2({
        version: 2,
        organizations: {
          engineering: makeOrganization([
            {
              account_id: '222222222222',
              account_alias: 'company-b',
              unexpected: true,
            } as unknown as BaseAccountInput,
          ]),
        },
      }),
    ).toThrow();
  });
});
