import { describe, expect, it } from 'vitest';
import { normalizeRooConfig } from './schema';

const validConfig = {
  version: 1,
  projects: {
    atlas: {
      accounts: {
        prod: '111111111111',
      },
    },
  },
};

function configWithIdentifiers(project: string, environment: string) {
  return {
    version: 1,
    projects: {
      [project]: {
        accounts: { [environment]: '111111111111' },
      },
    },
  };
}

describe('Roo Config v1 schema', () => {
  it('accepts version 1 and normalizes identifiers', () => {
    const config = normalizeRooConfig({
      version: 1,
      projects: {
        ' atlas ': {
          accounts: {
            ' prod ': '111111111111',
          },
        },
      },
    });

    expect(config.version).toBe(1);
    expect(config.projects.atlas?.accounts.prod).toBe('111111111111');
  });

  it('rejects unsupported versions', () => {
    expect(() => normalizeRooConfig({ ...validConfig, version: 2 })).toThrow();
  });

  it('accepts valid twelve-digit account IDs', () => {
    expect(() => normalizeRooConfig(validConfig)).not.toThrow();
  });

  it('normalizes omitted defaults to disabled and empty', () => {
    expect(normalizeRooConfig(validConfig).defaults).toEqual({
      enabled: false,
      roles: [],
    });
  });

  it('enables non-empty configured roles when enabled is omitted', () => {
    expect(
      normalizeRooConfig({
        ...validConfig,
        defaults: { roles: ['platform/security-readonly'] },
      }).defaults,
    ).toEqual({
      enabled: true,
      roles: ['platform/security-readonly'],
    });
  });

  it('keeps configured defaults unavailable when explicitly disabled', () => {
    expect(
      normalizeRooConfig({
        ...validConfig,
        defaults: { enabled: false, roles: ['platform/security-readonly'] },
      }).defaults,
    ).toEqual({
      enabled: false,
      roles: ['platform/security-readonly'],
    });
  });

  it('rejects a project identifier containing a newline', () => {
    expect(() => normalizeRooConfig(configWithIdentifiers('atlas\n', 'prod'))).toThrow();
  });

  it('rejects a project identifier containing a tab', () => {
    expect(() => normalizeRooConfig(configWithIdentifiers('\tatlas', 'prod'))).toThrow();
  });

  it('rejects an environment identifier containing a carriage return', () => {
    expect(() => normalizeRooConfig(configWithIdentifiers('atlas', 'prod\r'))).toThrow();
  });

  it('rejects an environment identifier containing a tab', () => {
    expect(() => normalizeRooConfig(configWithIdentifiers('atlas', '\tprod'))).toThrow();
  });

  it.each(['11111111111', '1111111111111', '11111111111a'])('rejects invalid account ID %s', (accountId) => {
    expect(() =>
      normalizeRooConfig({
        ...validConfig,
        projects: {
          atlas: { accounts: { prod: accountId } },
        },
      }),
    ).toThrow();
  });

  it('rejects duplicate account IDs', () => {
    expect(() =>
      normalizeRooConfig({
        version: 1,
        projects: {
          atlas: { accounts: { prod: '111111111111' } },
          nova: { accounts: { prod: '111111111111' } },
        },
      }),
    ).toThrow();
  });

  it('rejects generated account-name collisions after normalization', () => {
    expect(() =>
      normalizeRooConfig({
        version: 1,
        projects: {
          'a-b': { accounts: { c: '111111111111' } },
          a: { accounts: { 'b-c': '222222222222' } },
        },
      }),
    ).toThrow('Generated account name a-b-c is already used');
  });

  it('rejects additional-role environments missing from the project accounts', () => {
    expect(() =>
      normalizeRooConfig({
        version: 1,
        projects: {
          atlas: {
            accounts: { dev: '111111111111' },
            roles: { 'data-engineer': { environments: ['prod'] } },
          },
        },
      }),
    ).toThrow();
  });

  it('rejects empty roles and roles ending with a slash', () => {
    expect(() =>
      normalizeRooConfig({
        version: 1,
        projects: {
          atlas: { accounts: { prod: '111111111111' }, roles: { '': {} } },
        },
      }),
    ).toThrow();

    expect(() =>
      normalizeRooConfig({
        version: 1,
        projects: {
          atlas: { accounts: { prod: '111111111111' }, roles: { 'platform/admin/': {} } },
        },
      }),
    ).toThrow();
  });

  it('uses the shared AWS Console role validator for defaults and additional roles', () => {
    const role = 'division?team/security&ops/security-admin';
    const config = normalizeRooConfig({
      version: 1,
      defaults: { roles: [role] },
      projects: {
        atlas: {
          accounts: { prod: '111111111111' },
          roles: { [role]: {} },
        },
      },
    });

    expect(config.defaults.roles).toEqual([role]);
    expect(config.projects.atlas?.roles[role]).toEqual({});
  });

  it.each([
    'platform/security admin',
    'platform/role?name',
    'platform//security-admin',
    'division/security-admín',
  ])('rejects invalid role syntax in defaults and additional roles: %s', (role) => {
    expect(() =>
      normalizeRooConfig({
        version: 1,
        defaults: { roles: [role] },
        projects: {
          atlas: {
            accounts: { prod: '111111111111' },
            roles: { [role]: {} },
          },
        },
      }),
    ).toThrow();
  });

  it('rejects empty configured default-role lists', () => {
    expect(() =>
      normalizeRooConfig({
        ...validConfig,
        defaults: { enabled: true, roles: [] },
      }),
    ).toThrow();
  });

  it('rejects enabled defaults when roles are omitted', () => {
    expect(() =>
      normalizeRooConfig({
        ...validConfig,
        defaults: { enabled: true },
      }),
    ).toThrow();
  });

  it('accepts an explicitly disabled empty default-role set', () => {
    expect(
      normalizeRooConfig({
        ...validConfig,
        defaults: { enabled: false, roles: [] },
      }).defaults,
    ).toEqual({ enabled: false, roles: [] });
  });

  it('accepts a 64-character role path for defaults and additional roles', () => {
    const role = 'r'.repeat(64);
    const config = normalizeRooConfig({
      version: 1,
      defaults: { roles: [role] },
      projects: {
        atlas: {
          accounts: { prod: '111111111111' },
          roles: { [role]: {} },
        },
      },
    });

    expect(config.defaults.roles).toEqual([role]);
    expect(config.projects.atlas?.roles[role]).toEqual({});
  });

  it('rejects a 65-character role path for defaults and additional roles', () => {
    const role = 'r'.repeat(65);

    expect(() =>
      normalizeRooConfig({
        version: 1,
        defaults: { roles: [role] },
        projects: { atlas: { accounts: { prod: '111111111111' } } },
      }),
    ).toThrow();

    expect(() =>
      normalizeRooConfig({
        version: 1,
        projects: {
          atlas: {
            accounts: { prod: '111111111111' },
            roles: { [role]: {} },
          },
        },
      }),
    ).toThrow();
  });
});
