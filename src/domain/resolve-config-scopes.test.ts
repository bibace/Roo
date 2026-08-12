import { describe, expect, it } from 'vitest';
import { normalizeRooConfig, normalizeRooConfigV2 } from '../config/schema';
import { resolveConfigScopes } from './resolve-config-scopes';

describe('scoped Roo catalog resolution', () => {
  it('preserves v1 resolution behavior', () => {
    const config = normalizeRooConfig({
      version: 1,
      defaults: { roles: ['platform/example-readonly'] },
      projects: { atlas: { accounts: { prod: '111111111111' } } },
    });

    expect(resolveConfigScopes(config)).toEqual([
      {
        kind: 'simple',
        targets: [
          {
            accountId: '111111111111',
            accountName: 'atlas-prod',
            project: 'atlas',
            environment: 'prod',
            role: 'platform/example-readonly',
            roleShortName: 'example-readonly',
          },
        ],
      },
    ]);
  });

  it('resolves equivalent v1 and v2 Simple configs equivalently', () => {
    const input = {
      defaults: { roles: ['platform/example-readonly'] },
      projects: { atlas: { accounts: { prod: '111111111111' } } },
    };

    const v1 = resolveConfigScopes(normalizeRooConfig({ version: 1, ...input }));
    const v2 = resolveConfigScopes(normalizeRooConfigV2({ version: 2, ...input }));

    expect(v2[0]?.targets).toEqual(v1[0]?.targets);
  });

  it('keeps two organizations in separate resolved scopes', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111' }],
          defaults: { roles: ['platform/engineering-readonly'] },
          projects: { atlas: { accounts: { prod: '111111111112' } } },
        },
        corporate: {
          base_accounts: [{ account_id: '222222222222' }],
          defaults: { roles: ['platform/corporate-readonly'] },
          projects: { atlas: { accounts: { prod: '222222222223' } } },
        },
      },
    });

    expect(resolveConfigScopes(config)).toEqual([
      {
        kind: 'organization',
        organizationId: 'corporate',
        targets: [
          expect.objectContaining({
            accountName: 'atlas-prod',
            accountId: '222222222223',
            role: 'platform/corporate-readonly',
          }),
        ],
      },
      {
        kind: 'organization',
        organizationId: 'engineering',
        targets: [
          expect.objectContaining({
            accountName: 'atlas-prod',
            accountId: '111111111112',
            role: 'platform/engineering-readonly',
          }),
        ],
      },
    ]);
  });

  it('keeps organization defaults out of other organization scopes', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111' }],
          defaults: { roles: ['platform/engineering-readonly'] },
          projects: { atlas: { accounts: { prod: '111111111112' } } },
        },
        corporate: {
          base_accounts: [{ account_id: '222222222222' }],
          defaults: { roles: ['platform/corporate-readonly'] },
          projects: { atlas: { accounts: { prod: '222222222223' } } },
        },
      },
    });

    const scopes = resolveConfigScopes(config);
    const corporate = scopes.find(
      (scope) => scope.kind === 'organization' && scope.organizationId === 'corporate',
    );
    const engineering = scopes.find(
      (scope) => scope.kind === 'organization' && scope.organizationId === 'engineering',
    );

    expect(corporate?.targets.map((target) => target.role)).toEqual([
      'platform/corporate-readonly',
    ]);
    expect(engineering?.targets.map((target) => target.role)).toEqual([
      'platform/engineering-readonly',
    ]);
  });

  it('keeps explicit role environment filtering unchanged', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111' }],
          projects: {
            atlas: {
              accounts: { dev: '111111111112', prod: '111111111113' },
              roles: { 'platform/data-engineer': { environments: ['prod'] } },
            },
          },
        },
      },
    });

    expect(resolveConfigScopes(config)[0]?.targets.map((target) => target.accountName)).toEqual([
      'atlas-prod',
    ]);
  });

  it('does not create targets from base_accounts alone', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111' }],
          defaults: { roles: ['platform/example-readonly'] },
          projects: {},
        },
      },
    });

    expect(resolveConfigScopes(config)[0]?.targets).toEqual([]);
  });

  it('creates targets only from an explicit same-organization project account', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111' }],
          defaults: { roles: ['platform/example-readonly'] },
          projects: { platform: { accounts: { base: '111111111111' } } },
        },
      },
    });

    expect(resolveConfigScopes(config)[0]?.targets).toEqual([
      expect.objectContaining({
        accountId: '111111111111',
        accountName: 'platform-base',
      }),
    ]);
  });

  it('returns organization output in deterministic order', () => {
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
      },
    });

    expect(
      resolveConfigScopes(config).map((scope) =>
        scope.kind === 'organization' ? scope.organizationId : 'simple',
      ),
    ).toEqual(['alpha', 'zebra']);
  });
});
