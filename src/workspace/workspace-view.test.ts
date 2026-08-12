import { describe, expect, it } from 'vitest';
import { summarizeCatalog } from '../catalog/catalog-summary';
import { normalizeRooConfig, normalizeRooConfigV2 } from '../config/schema';
import { resolveConfigScopes } from '../domain/resolve-config-scopes';
import type { RooConfigDocument } from '../config/types';
import { buildWorkspaceView } from './workspace-view';

function readyCatalog(config: RooConfigDocument, catalogVersion = 1) {
  const scopes = resolveConfigScopes(config);

  return {
    status: 'ready' as const,
    snapshot: {
      storageVersion: 1 as const,
      catalogVersion,
      source: { kind: 'created' as const },
      config,
    },
    scopes,
    summary: summarizeCatalog(config, scopes),
  };
}

function simpleConfig(overrides: Record<string, unknown> = {}) {
  return normalizeRooConfig({
    version: 1,
    defaults: { enabled: false },
    projects: {
      atlas: {
        accounts: { prod: '111111111111' },
        roles: { 'platform/read-only': {} },
      },
    },
    ...overrides,
  });
}

function organizationConfig() {
  return normalizeRooConfigV2({
    version: 2,
    organizations: {
      engineering: {
        base_accounts: [{ account_id: '111111111111' }],
        projects: {
          atlas: {
            accounts: { prod: '111111111112' },
            roles: { 'platform/engineering-readonly': {} },
          },
        },
      },
      corporate: {
        base_accounts: [{ account_id: '222222222222' }],
        projects: {
          atlas: {
            accounts: { prod: '222222222223' },
            roles: { 'platform/corporate-readonly': {} },
          },
        },
      },
      empty: {
        base_accounts: [{ account_id: '333333333333' }],
        projects: {
          tools: {
            accounts: { dev: '333333333334' },
            roles: {},
          },
        },
      },
    },
  });
}

describe('buildWorkspaceView', () => {
  it('returns the empty configuration view without synthesizing targets', () => {
    expect(buildWorkspaceView({ status: 'empty' })).toEqual({
      status: 'empty',
      mode: 'simple',
      catalogToken: { kind: 'empty' },
      catalog: { status: 'empty', scopes: [] },
      targets: [],
      summary: { accounts: 0, roles: 0 },
      organizations: [],
    });
  });

  it.each([
    ['invalid', { status: 'invalid' as const }, { kind: 'invalid' as const }],
  ])('returns an invalid view for a %s catalog', (_label, catalog, token) => {
    expect(buildWorkspaceView(catalog)).toMatchObject({
      status: 'invalid',
      mode: 'simple',
      catalogToken: token,
      catalog: { status: catalog.status, scopes: [] },
      targets: [],
      summary: { accounts: 0, roles: 0 },
      organizations: [],
    });
  });

  it('builds a ready Simple view from the resolved Simple scope', () => {
    const workspace = buildWorkspaceView(readyCatalog(simpleConfig(), 4));

    expect(workspace).toMatchObject({
      status: 'ready',
      mode: 'simple',
      catalogToken: { kind: 'ready', catalogVersion: 4 },
      targets: [expect.objectContaining({ accountId: '111111111111', role: 'platform/read-only' })],
      organizations: [],
    });
    expect(workspace.summary).toEqual({ accounts: 1, roles: 1 });
    expect(workspace.catalog.status).toBe('ready');
  });

  it('keeps a ready Simple configuration with zero targets empty', () => {
    const config = simpleConfig({
      projects: { atlas: { accounts: { prod: '111111111111' }, roles: {} } },
    });
    const workspace = buildWorkspaceView(readyCatalog(config));

    expect(workspace.status).toBe('empty');
    expect(workspace.targets).toEqual([]);
    expect(workspace.summary).toEqual({ accounts: 0, roles: 0 });
  });

  it('builds sorted organization scopes and flattens only their Configuration targets', () => {
    const workspace = buildWorkspaceView(readyCatalog(organizationConfig(), 8));

    expect(workspace.status).toBe('ready');
    expect(workspace.mode).toBe('organization');
    expect(workspace.organizations.map((scope) => scope.organizationId)).toEqual([
      'corporate',
      'empty',
      'engineering',
    ]);
    expect(workspace.organizations.map((scope) => scope.status)).toEqual(['ready', 'empty', 'ready']);
    expect(workspace.organizations.map((scope) => scope.targets.map((target) => target.accountId))).toEqual([
      ['222222222223'],
      [],
      ['111111111112'],
    ]);
    expect(workspace.targets.map((target) => target.accountId)).toEqual([
      '222222222223',
      '111111111112',
    ]);
    expect(workspace.summary).toEqual({ accounts: 2, roles: 2 });
  });
});
