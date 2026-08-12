import type { JumpTarget } from '../domain/jump-target';
import { isValidAwsConsoleRole } from '../domain/aws-console-role';
import { AwsNavigationError } from './aws-navigation-error';

const AWS_SWITCH_ROLE_ENDPOINT = 'https://signin.aws.amazon.com/switchrole';
const AWS_ACCOUNT_ID_PATTERN = /^\d{12}$/;

export interface AwsSwitchRoleRequest {
  endpoint: string;
  account: string;
  roleName: string;
  displayName: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function buildAwsSwitchRoleRequest(target: JumpTarget): AwsSwitchRoleRequest {
  const candidate = isRecord(target) ? target : undefined;
  const accountId = candidate?.accountId;

  if (typeof accountId !== 'string' || !AWS_ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new AwsNavigationError(
      'INVALID_ACCOUNT_ID',
      'AWS account ID must contain exactly 12 decimal digits.',
    );
  }

  const role = candidate?.role;

  if (!isValidAwsConsoleRole(role)) {
    throw new AwsNavigationError('INVALID_ROLE', 'AWS role must be a valid role path.');
  }

  return {
    endpoint: AWS_SWITCH_ROLE_ENDPOINT,
    account: accountId,
    roleName: role,
    displayName: `${target.accountName} | ${accountId}`,
  };
}
