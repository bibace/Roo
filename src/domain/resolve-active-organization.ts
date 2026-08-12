import type { AwsConsoleContext } from '../aws-context/types';
import type { RooConfigV2Organizations } from '../config/types';
import { buildOrganizationOwnershipIndex } from './organization-ownership';

export type ActiveOrganizationResolution =
  | {
      status: 'resolved';
      organizationId: string;
      evidence: 'base-login' | 'current-account';
    }
  | { status: 'unresolved' }
  | { status: 'conflict' };

export function resolveActiveOrganization(
  config: RooConfigV2Organizations,
  context: AwsConsoleContext,
): ActiveOrganizationResolution {
  const ownership = buildOrganizationOwnershipIndex(config);

  const resolveBase = (value: string | null): string | undefined => {
    if (value === null) {
      return undefined;
    }

    return ownership.baseAccountIds.get(value) ?? ownership.baseAccountAliases.get(value);
  };

  const resolveCurrent = (value: string | null): string | undefined => {
    if (value === null) {
      return undefined;
    }

    return ownership.accountIds.get(value) ?? ownership.baseAccountAliases.get(value);
  };

  const loginOrganizationId = resolveBase(context.loginAccountIdOrAlias);
  const currentOrganizationId = resolveCurrent(context.currentAccountIdOrAlias);

  if (
    loginOrganizationId !== undefined &&
    currentOrganizationId !== undefined &&
    loginOrganizationId !== currentOrganizationId
  ) {
    return { status: 'conflict' };
  }

  if (loginOrganizationId !== undefined) {
    return {
      status: 'resolved',
      organizationId: loginOrganizationId,
      evidence: 'base-login',
    };
  }

  if (currentOrganizationId !== undefined) {
    return {
      status: 'resolved',
      organizationId: currentOrganizationId,
      evidence: 'current-account',
    };
  }

  return { status: 'unresolved' };
}
