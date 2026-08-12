import { describe, expect, it } from 'vitest';
import { normalizeRooConfigV2 } from '../config/schema';
import type { AwsConsoleContext } from '../aws-context/types';
import { resolveActiveOrganization } from './resolve-active-organization';

function makeConfig() {
  const config = normalizeRooConfigV2({
    version: 2,
    organizations: {
      engineering: {
        base_accounts: [
          {
            account_id: '111111111111',
            account_alias: 'engineering-root',
          },
          {
            account_id: '111111111112',
            account_alias: 'engineering-sso',
          },
        ],
        projects: { atlas: { accounts: { prod: '111111111113' } } },
      },
      corporate: {
        base_accounts: [{ account_id: '222222222222', account_alias: 'corporate-root' }],
        projects: { atlas: { accounts: { prod: '222222222223' } } },
      },
    },
  });

  if (!('organizations' in config)) {
    throw new Error('Expected Organization Mode.');
  }

  return config;
}

function context(overrides: Partial<AwsConsoleContext> = {}): AwsConsoleContext {
  return {
    loginAccountIdOrAlias: null,
    currentAccountIdOrAlias: null,
    multiSession: false,
    source: 'dom',
    ...overrides,
  };
}

describe('resolveActiveOrganization', () => {
  it.each([
    ['first base account ID', { loginAccountIdOrAlias: '111111111111' }, 'engineering', 'base-login'],
    ['first base account alias', { loginAccountIdOrAlias: 'engineering-root' }, 'engineering', 'base-login'],
    ['second base account ID', { loginAccountIdOrAlias: '111111111112' }, 'engineering', 'base-login'],
    ['second base account alias', { loginAccountIdOrAlias: 'engineering-sso' }, 'engineering', 'base-login'],
    ['configured member account', { currentAccountIdOrAlias: '111111111113' }, 'engineering', 'current-account'],
  ])('resolves %s', (_label, values, organizationId, evidence) => {
    expect(resolveActiveOrganization(makeConfig(), context(values))).toEqual({
      status: 'resolved',
      organizationId,
      evidence,
    });
  });

  it('uses base-login evidence before a same-organization current member account', () => {
    expect(resolveActiveOrganization(
      makeConfig(),
      context({ loginAccountIdOrAlias: '111111111111', currentAccountIdOrAlias: '111111111113' }),
    )).toEqual({ status: 'resolved', organizationId: 'engineering', evidence: 'base-login' });
  });

  it('fails closed when login and current account ownership conflict', () => {
    expect(resolveActiveOrganization(
      makeConfig(),
      context({ loginAccountIdOrAlias: '111111111111', currentAccountIdOrAlias: '222222222223', multiSession: true }),
    )).toEqual({ status: 'conflict' });
  });

  it.each([
    ['unknown account', context({ currentAccountIdOrAlias: '999999999999' })],
    ['missing context', context()],
  ])('returns unresolved for %s', (_label, activeContext) => {
    expect(resolveActiveOrganization(makeConfig(), activeContext)).toEqual({ status: 'unresolved' });
  });
});
