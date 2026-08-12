import { describe, expect, it, vi } from 'vitest';
import type { AwsConsoleContextProbe } from '../aws-context/types';
import type { PersistedCatalogLoadResult } from '../catalog/load-persisted-catalog';
import { normalizeRooConfig, normalizeRooConfigV2 } from '../config/schema';
import { resolveConfigScopes } from '../domain/resolve-config-scopes';
import { buildWorkspaceView } from '../workspace/workspace-view';
import { getPopupBootstrap } from './popup-bootstrap-service';

function makeSimpleCatalog(): PersistedCatalogLoadResult {
  const config = normalizeRooConfig({
    version: 1,
    defaults: { enabled: false },
    projects: {
      atlas: {
        accounts: { prod: '111111111111' },
        roles: { 'platform/security-readonly': {} },
      },
    },
  });
  const scopes = resolveConfigScopes(config);

  return {
    status: 'ready',
    snapshot: {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'created' },
      config,
    },
    scopes,
    summary: { projects: 1, accounts: 1, destinations: 1 },
  };
}

function makeZeroDestinationSimpleCatalog(): PersistedCatalogLoadResult {
  const config = normalizeRooConfig({
    version: 1,
    projects: {},
  });
  const scopes = resolveConfigScopes(config);

  return {
    status: 'ready',
    snapshot: {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'created' },
      config,
    },
    scopes,
    summary: { projects: 0, accounts: 0, destinations: 0 },
  };
}

function makeOrganizationCatalog(
  organizations: Record<string, unknown> = {
    engineering: {
      base_accounts: [{ account_id: '111111111111' }],
      projects: {
        atlas: {
          accounts: { prod: '111111111112' },
          roles: { 'platform/read-only': {} },
        },
      },
    },
    corporate: {
      base_accounts: [{ account_id: '222222222222' }],
      projects: {
        atlas: {
          accounts: { prod: '222222222223' },
          roles: { 'platform/read-only': {} },
        },
      },
    },
  },
): PersistedCatalogLoadResult {
  const config = normalizeRooConfigV2({ version: 2, organizations });
  const scopes = resolveConfigScopes(config);

  return {
    status: 'ready',
    snapshot: {
      storageVersion: 1,
      catalogVersion: 2,
      source: { kind: 'uploaded', fileName: 'organizations.yaml' },
      config,
    },
    scopes,
    summary: { projects: 2, accounts: 2, destinations: 2 },
  };
}

function workspace(catalog: PersistedCatalogLoadResult) {
  return buildWorkspaceView(catalog);
}

function readyProbe(
  loginAccountIdOrAlias: string | null,
  currentAccountIdOrAlias: string | null = null,
): AwsConsoleContextProbe {
  return {
    tabId: 7,
    result: {
      status: 'ready',
      context: {
        loginAccountIdOrAlias,
        currentAccountIdOrAlias,
        multiSession: false,
        source: 'dom',
      },
    },
  };
}

function dependencies(
  currentWorkspace: ReturnType<typeof workspace>,
  probe: AwsConsoleContextProbe,
) {
  return {
    getWorkspace: vi.fn().mockResolvedValue(currentWorkspace),
    getActiveAwsTabContextProbe: vi.fn().mockResolvedValue(probe),
  };
}

describe('getPopupBootstrap', () => {
  it('returns Simple Configuration targets with one Workspace read and no AWS probe', async () => {
    const deps = dependencies(workspace(makeSimpleCatalog()), readyProbe('111111111111'));

    await expect(getPopupBootstrap(deps)).resolves.toMatchObject({
      catalogStatus: 'ready',
      targets: [expect.objectContaining({ accountId: '111111111111' })],
      summary: { accounts: 1, roles: 1 },
    });
    expect(deps.getWorkspace).toHaveBeenCalledTimes(1);
    expect(deps.getActiveAwsTabContextProbe).not.toHaveBeenCalled();
  });

  it('keeps a ready Simple Configuration ready when it has zero destinations', async () => {
    const deps = dependencies(
      workspace(makeZeroDestinationSimpleCatalog()),
      readyProbe(null),
    );

    await expect(getPopupBootstrap(deps)).resolves.toEqual({
      catalogStatus: 'ready',
      searchEnabled: true,
      summary: { accounts: 0, roles: 0 },
      targets: [],
    });
    expect(deps.getActiveAwsTabContextProbe).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', { status: 'empty' as const }],
    ['invalid', { status: 'invalid' as const }],
  ])('preserves the %s persisted catalog status', async (_label, catalog) => {
    const deps = dependencies(workspace(catalog), readyProbe(null));

    await expect(getPopupBootstrap(deps)).resolves.toMatchObject({
      catalogStatus: catalog.status,
      targets: [],
    });
  });

  it('resolves exactly one organization with one Workspace read and one AWS probe', async () => {
    const deps = dependencies(
      workspace(makeOrganizationCatalog()),
      readyProbe('111111111111'),
    );

    const result = await getPopupBootstrap(deps);

    expect(result.organizationId).toBe('engineering');
    expect(result.targets.map((target) => target.accountId)).toEqual(['111111111112']);
    expect(deps.getWorkspace).toHaveBeenCalledTimes(1);
    expect(deps.getActiveAwsTabContextProbe).toHaveBeenCalledTimes(1);
  });

  it('fails closed on organization conflict', async () => {
    const deps = dependencies(
      workspace(makeOrganizationCatalog()),
      readyProbe('111111111111', '222222222223'),
    );

    await expect(getPopupBootstrap(deps)).resolves.toMatchObject({
      contextMessage: 'AWS account context conflicts with Roo organization ownership.',
      searchEnabled: false,
      targets: [],
    });
  });

  it('fails closed when organization ownership is unresolved', async () => {
    const deps = dependencies(
      workspace(makeOrganizationCatalog()),
      readyProbe(null, '999999999999'),
    );

    await expect(getPopupBootstrap(deps)).resolves.toMatchObject({
      contextMessage: 'Current AWS account is not assigned to a Roo organization.',
      searchEnabled: false,
      targets: [],
    });
  });

  it('handles unavailable AWS context without organization fallback', async () => {
    const deps = dependencies(workspace(makeOrganizationCatalog()), {
      tabId: 9,
      result: { status: 'unavailable' },
    });

    await expect(getPopupBootstrap(deps)).resolves.toMatchObject({
      contextMessage: 'Unable to determine the current AWS account.',
      searchEnabled: false,
      targets: [],
    });
  });

  it('handles a non-AWS tab', async () => {
    const deps = dependencies(workspace(makeOrganizationCatalog()), {
      tabId: 12,
      result: { status: 'not-aws-console' },
    });

    await expect(getPopupBootstrap(deps)).resolves.toMatchObject({
      contextMessage: 'Open Roo from a supported AWS Console tab.',
      searchEnabled: false,
      targets: [],
    });
  });

  it('reports a resolved organization with zero destinations', async () => {
    const catalog = makeOrganizationCatalog({
      engineering: {
        base_accounts: [{ account_id: '111111111111' }],
        projects: { atlas: { accounts: { prod: '111111111112' } } },
      },
    });
    const deps = dependencies(workspace(catalog), readyProbe('111111111111'));

    await expect(getPopupBootstrap(deps)).resolves.toMatchObject({
      catalogStatus: 'ready',
      contextMessage: 'No destinations configured for this organization.',
      organizationId: 'engineering',
      searchEnabled: true,
      targets: [],
    });
  });
});
