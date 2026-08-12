import type { PersistedCatalogLoadResult } from '../catalog/load-persisted-catalog';
import { getRooConfigMode } from '../config/scopes';
import { summarizeJumpTargets } from '../domain/summarize-jump-targets';
import type {
  CatalogMutationToken,
  WorkspaceOrganizationScope,
  WorkspaceView,
} from './types';

function getCatalogToken(result: PersistedCatalogLoadResult): CatalogMutationToken {
  return result.status === 'ready'
    ? { kind: 'ready', catalogVersion: result.snapshot.catalogVersion }
    : { kind: result.status };
}

function getCatalogStatus(result: PersistedCatalogLoadResult): WorkspaceView['catalog']['status'] {
  return result.status;
}

function getCatalogMetadata(
  catalog: Extract<PersistedCatalogLoadResult, { status: 'ready' }>,
): WorkspaceView['catalog'] {
  return {
    status: 'ready',
    source: catalog.snapshot.source,
    catalogVersion: catalog.snapshot.catalogVersion,
    summary: catalog.summary,
    config: catalog.snapshot.config,
    scopes: catalog.scopes,
  };
}

function getZeroSummary() {
  return { accounts: 0, roles: 0 } as const;
}

function buildOrganizationScope(
  organizationId: string,
  targets: WorkspaceOrganizationScope['targets'],
): WorkspaceOrganizationScope {
  return {
    organizationId,
    status: targets.length > 0 ? 'ready' : 'empty',
    targets,
    summary: summarizeJumpTargets(targets),
  };
}

export function buildWorkspaceView(
  catalog: PersistedCatalogLoadResult,
): WorkspaceView {
  const catalogToken = getCatalogToken(catalog);

  if (catalog.status !== 'ready') {
    return {
      status: catalog.status === 'empty' ? 'empty' : 'invalid',
      mode: 'simple',
      catalogToken,
      catalog: {
        status: getCatalogStatus(catalog),
        scopes: [],
      },
      targets: [],
      summary: getZeroSummary(),
      organizations: [],
    };
  }

  const config = catalog.snapshot.config;
  const mode = getRooConfigMode(config);

  if (mode === 'simple') {
    const simpleScope = catalog.scopes.find((scope) => scope.kind === 'simple');
    const targets = simpleScope?.kind === 'simple' ? simpleScope.targets : [];

    return {
      status: targets.length > 0 ? 'ready' : 'empty',
      mode,
      catalogToken,
      catalog: getCatalogMetadata(catalog),
      targets,
      summary: summarizeJumpTargets(targets),
      organizations: [],
    };
  }

  if (!('organizations' in config)) {
    throw new Error('Organization Mode must contain organizations.');
  }

  const organizations = Object.keys(config.organizations)
    .sort()
    .map((organizationId) => {
      const resolvedScope = catalog.scopes.find(
        (scope) => scope.kind === 'organization' && scope.organizationId === organizationId,
      );
      const targets = resolvedScope?.kind === 'organization' ? resolvedScope.targets : [];
      return buildOrganizationScope(organizationId, targets);
    });
  const targets = organizations.flatMap((organization) => organization.targets);

  return {
    status: organizations.some((organization) => organization.status === 'ready')
      ? 'ready'
      : 'empty',
    mode,
    catalogToken,
    catalog: getCatalogMetadata(catalog),
    targets,
    summary: summarizeJumpTargets(targets),
    organizations,
  };
}
