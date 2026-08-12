import type { CatalogSummary } from '../catalog/catalog-summary';
import type { ConfigurationSourceIdentity } from '../catalog/persisted-catalog';
import type { RooConfigDocument, RooConfigMode } from '../config/types';
import type { JumpTarget } from '../domain/jump-target';
import type { JumpTargetSummary } from '../domain/summarize-jump-targets';
import type { ResolvedCatalogScope } from '../domain/resolve-config-scopes';

export type CatalogMutationToken =
  | { kind: 'ready'; catalogVersion: number }
  | { kind: 'empty' }
  | { kind: 'invalid' };

export type CatalogSourceStatus = CatalogMutationToken['kind'];
export type WorkspaceStatus = 'ready' | 'empty' | 'invalid';

export interface WorkspaceOrganizationScope {
  organizationId: string;
  status: WorkspaceStatus;
  targets: JumpTarget[];
  summary: JumpTargetSummary;
}

export interface WorkspaceView {
  status: WorkspaceStatus;
  mode: RooConfigMode;
  catalogToken: CatalogMutationToken;
  catalog: {
    status: CatalogSourceStatus;
    source?: ConfigurationSourceIdentity;
    catalogVersion?: number;
    summary?: CatalogSummary;
    config?: RooConfigDocument;
    scopes: ResolvedCatalogScope[];
  };
  targets: JumpTarget[];
  summary: JumpTargetSummary;
  organizations: WorkspaceOrganizationScope[];
}

export function isSameCatalogMutationToken(
  left: CatalogMutationToken,
  right: CatalogMutationToken,
): boolean {
  return left.kind === right.kind &&
    (left.kind !== 'ready' || right.kind !== 'ready' || left.catalogVersion === right.catalogVersion);
}
