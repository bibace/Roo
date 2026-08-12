import { describe, expect, it } from 'vitest';
import type { JumpTarget } from '../domain/jump-target';
import { AwsNavigationError, type AwsNavigationErrorCode } from './aws-navigation-error';
import { buildAwsSwitchRoleRequest } from './build-aws-switch-role-request';

function makeTarget(overrides: Partial<JumpTarget> = {}): JumpTarget {
  return {
    accountId: '333333333333',
    accountName: 'atlas-prod',
    project: 'atlas',
    environment: 'prod',
    role: 'platform/data/data-engineer',
    roleShortName: 'data-engineer',
    ...overrides,
  };
}

function expectNavigationError(action: () => unknown, code: AwsNavigationErrorCode) {
  let error: unknown;

  try {
    action();
  } catch (caughtError) {
    error = caughtError;
  }

  expect(error).toBeInstanceOf(AwsNavigationError);
  expect((error as AwsNavigationError).code).toBe(code);
}

describe('buildAwsSwitchRoleRequest', () => {
  it('builds the fixed request with the complete role path and display name', () => {
    const target = makeTarget();
    const originalTarget = { ...target };

    expect(buildAwsSwitchRoleRequest(target)).toEqual({
      endpoint: 'https://signin.aws.amazon.com/switchrole',
      account: '333333333333',
      roleName: 'platform/data/data-engineer',
      displayName: 'atlas-prod | 333333333333',
    });
    expect(target).toEqual(originalTarget);
  });

  it('derives displayName from accountName and ignores roleShortName', () => {
    const target = makeTarget();
    const request = buildAwsSwitchRoleRequest(target);

    expect(buildAwsSwitchRoleRequest({ ...target, accountName: 'atlas-staging' })).toEqual({
      ...request,
      displayName: 'atlas-staging | 333333333333',
    });
    expect(buildAwsSwitchRoleRequest({ ...target, roleShortName: 'different-name' })).toEqual(
      request,
    );
  });

  it('accepts URL-significant path characters without changing the role', () => {
    const role = 'division?team/security&ops/security-admin';

    expect(buildAwsSwitchRoleRequest(makeTarget({ role }))).toMatchObject({
      endpoint: 'https://signin.aws.amazon.com/switchrole',
      roleName: role,
    });
  });

  it.each([
    '123',
    '12345678901',
    '1234567890123',
    '12345678901a',
    '123456789012&roleName=admin',
  ])('rejects invalid account ID %s', (accountId) => {
    expectNavigationError(
      () => buildAwsSwitchRoleRequest(makeTarget({ accountId })),
      'INVALID_ACCOUNT_ID',
    );
  });

  it.each([
    '',
    '   ',
    ' platform/admin',
    'platform/admin ',
    'platform/security admin',
    '/platform/admin',
    'platform/admin/',
    'platform//admin',
    'platform/role?name',
    'platform/role#name',
    'platform/role&name',
    'platform/role\u0000name',
    'división/security-admin',
    'platform/security-admín',
    'r'.repeat(65),
  ])('rejects invalid role %s', (role) => {
    expectNavigationError(() => buildAwsSwitchRoleRequest(makeTarget({ role })), 'INVALID_ROLE');
  });

  it('rejects a non-string role at runtime', () => {
    expectNavigationError(
      () => buildAwsSwitchRoleRequest(makeTarget({ role: 42 as unknown as string })),
      'INVALID_ROLE',
    );
  });
});
