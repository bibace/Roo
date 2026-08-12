import type {
  RooConfigDocument,
  RooConfigMode,
  RooConfigScope,
  RooConfigV1,
  RooConfigV2Simple,
  RooOrganization,
  RooOrganizationScope,
  RooSimpleScope,
} from './types';

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function getRooConfigMode(config: RooConfigDocument): RooConfigMode {
  return 'organizations' in config ? 'organization' : 'simple';
}

function toSimpleScope(
  config: RooConfigV1 | RooConfigV2Simple,
): RooSimpleScope {
  return {
    kind: 'simple',
    configVersion: config.version,
    defaults: config.defaults,
    projects: config.projects,
  };
}

function toOrganizationScope(
  organizationId: string,
  organization: RooOrganization,
): RooOrganizationScope {
  return {
    kind: 'organization',
    configVersion: 2,
    organizationId,
    baseAccounts: organization.baseAccounts,
    defaults: organization.defaults,
    projects: organization.projects,
  };
}

export function toRooConfigScopes(config: RooConfigDocument): RooConfigScope[] {
  if (getRooConfigMode(config) === 'simple') {
    return [toSimpleScope(config as RooConfigV1 | RooConfigV2Simple)];
  }

  if (config.version !== 2 || !('organizations' in config)) {
    throw new Error('Organization Mode requires a version 2 organization config.');
  }

  return Object.keys(config.organizations)
    .sort(compareStrings)
    .map((organizationId) => {
      const organization = config.organizations[organizationId];

      if (!organization) {
        throw new Error(`Organization ${organizationId} is missing.`);
      }

      return toOrganizationScope(organizationId, organization);
    });
}
