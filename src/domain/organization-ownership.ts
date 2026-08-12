import type { RooConfigV2Organizations } from '../config/types';

export interface OrganizationOwnershipIndex {
  baseAccountIds: Map<string, string>;
  baseAccountAliases: Map<string, string>;
  accountIds: Map<string, string>;
}

function setBaseAccountOwner(
  index: Map<string, string>,
  accountId: string,
  organizationId: string,
) {
  if (index.has(accountId)) {
    throw new Error(`Base account ID ${accountId} has conflicting ownership.`);
  }

  index.set(accountId, organizationId);
}

function setAliasOwner(
  index: Map<string, string>,
  alias: string,
  organizationId: string,
) {
  if (index.has(alias)) {
    throw new Error(`Base account alias ${alias} has conflicting ownership.`);
  }

  index.set(alias, organizationId);
}

function setProjectAccountOwner(
  index: Map<string, string>,
  projectAccountIds: Map<string, string>,
  accountId: string,
  organizationId: string,
) {
  const previousProjectOwner = projectAccountIds.get(accountId);

  if (previousProjectOwner !== undefined) {
    throw new Error(`Project account ID ${accountId} has conflicting ownership.`);
  }

  const previousOwner = index.get(accountId);

  if (previousOwner !== undefined && previousOwner !== organizationId) {
    throw new Error(`Account ID ${accountId} has conflicting ownership.`);
  }

  projectAccountIds.set(accountId, organizationId);
  index.set(accountId, organizationId);
}

export function buildOrganizationOwnershipIndex(
  config: RooConfigV2Organizations,
): OrganizationOwnershipIndex {
  const baseAccountIds = new Map<string, string>();
  const baseAccountAliases = new Map<string, string>();
  const accountIds = new Map<string, string>();
  const projectAccountIds = new Map<string, string>();

  for (const [organizationId, organization] of Object.entries(config.organizations)) {
    for (const baseAccount of organization.baseAccounts) {
      setBaseAccountOwner(baseAccountIds, baseAccount.accountId, organizationId);

      if (baseAccount.accountAlias !== undefined) {
        setAliasOwner(baseAccountAliases, baseAccount.accountAlias, organizationId);
      }

      const previousOwner = accountIds.get(baseAccount.accountId);

      if (previousOwner !== undefined && previousOwner !== organizationId) {
        throw new Error(`Account ID ${baseAccount.accountId} has conflicting ownership.`);
      }

      accountIds.set(baseAccount.accountId, organizationId);
    }

    for (const organizationProject of Object.values(organization.projects)) {
      for (const accountId of Object.values(organizationProject.accounts)) {
        setProjectAccountOwner(accountIds, projectAccountIds, accountId, organizationId);
      }
    }
  }

  return {
    baseAccountIds,
    baseAccountAliases,
    accountIds,
  };
}
