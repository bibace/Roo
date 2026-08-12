import { toRooConfigScopes } from '../config/scopes';
import type { RooConfigDocument } from '../config/types';
import type { JumpTarget } from './jump-target';
import { resolveScopeCatalog } from './resolve-catalog';

export type ResolvedCatalogScope =
  | {
      kind: 'simple';
      targets: JumpTarget[];
    }
  | {
      kind: 'organization';
      organizationId: string;
      targets: JumpTarget[];
    };

export function resolveConfigScopes(config: RooConfigDocument): ResolvedCatalogScope[] {
  return toRooConfigScopes(config).map((scope) => {
    const targets = resolveScopeCatalog(scope);

    return scope.kind === 'simple'
      ? { kind: 'simple', targets }
      : { kind: 'organization', organizationId: scope.organizationId, targets };
  });
}
