import { describe, expect, it } from 'vitest';
import { normalizeRooConfig, normalizeRooConfigV2 } from './schema';
import { getRooConfigMode, toRooConfigScopes } from './scopes';

describe('Roo config scopes', () => {
  it('converts v1 to one simple scope', () => {
    const config = normalizeRooConfig({
      version: 1,
      projects: { atlas: { accounts: { prod: '111111111111' } } },
    });

    expect(toRooConfigScopes(config)).toEqual([
      {
        kind: 'simple',
        configVersion: 1,
        defaults: { enabled: false, roles: [] },
        projects: config.projects,
      },
    ]);
    expect(getRooConfigMode(config)).toBe('simple');
  });

  it('converts v2 Simple Mode to one simple scope', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      projects: { atlas: { accounts: { prod: '111111111111' } } },
    });

    const [scope] = toRooConfigScopes(config);

    expect(scope).toMatchObject({ kind: 'simple', configVersion: 2 });
    expect(scope).not.toHaveProperty('organizationId');
    expect(getRooConfigMode(config)).toBe('simple');
  });

  it('converts v2 organizations to independent organization scopes', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111' }],
          projects: { atlas: { accounts: { prod: '111111111112' } } },
        },
        corporate: {
          base_accounts: [{ account_id: '222222222222' }],
          projects: { atlas: { accounts: { prod: '222222222223' } } },
        },
      },
    });

    expect(toRooConfigScopes(config)).toHaveLength(2);
    expect(getRooConfigMode(config)).toBe('organization');
  });

  it('normalizes organisations input before creating scopes', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organisations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111' }],
          projects: { atlas: { accounts: { prod: '111111111112' } } },
        },
      },
    });

    const [scope] = toRooConfigScopes(config);

    expect(scope).toMatchObject({ kind: 'organization', organizationId: 'engineering' });
  });

  it('sorts organization scopes by organization ID', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        zebra: {
          base_accounts: [{ account_id: '333333333333' }],
          projects: {},
        },
        alpha: {
          base_accounts: [{ account_id: '111111111111' }],
          projects: {},
        },
        middle: {
          base_accounts: [{ account_id: '222222222222' }],
          projects: {},
        },
      },
    });

    expect(
      toRooConfigScopes(config).map((scope) =>
        scope.kind === 'organization' ? scope.organizationId : 'simple',
      ),
    ).toEqual([
      'alpha',
      'middle',
      'zebra',
    ]);
  });
});
