import type { RooConfigDocument } from '../config/types';
import type { ResolvedCatalogScope } from '../domain/resolve-config-scopes';

export interface CatalogSummary {
  projects: number;
  accounts: number;
  destinations: number;
}

export function summarizeCatalog(
  config: RooConfigDocument,
  scopes: readonly ResolvedCatalogScope[],
): CatalogSummary {
  if ('organizations' in config) {
    return {
      projects: Object.values(config.organizations).reduce(
        (projectCount, organization) => projectCount + Object.keys(organization.projects).length,
        0,
      ),
      accounts: Object.values(config.organizations).reduce(
        (accountCount, organization) => accountCount + Object.values(organization.projects).reduce(
          (projectAccountCount, project) => projectAccountCount + Object.keys(project.accounts).length,
          0,
        ),
        0,
      ),
      destinations: scopes.reduce((destinationCount, scope) => destinationCount + scope.targets.length, 0),
    };
  }

  return {
    projects: Object.keys(config.projects).length,
    accounts: Object.values(config.projects).reduce(
      (accountCount, project) => accountCount + Object.keys(project.accounts).length,
      0,
    ),
    destinations: scopes.reduce((destinationCount, scope) => destinationCount + scope.targets.length, 0),
  };
}
