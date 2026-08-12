import { describe, expect, it } from 'vitest';
import { normalizeRooConfigV2 } from '../config/schema';
import type { RooConfigV2Organizations } from '../config/types';
import { buildOrganizationOwnershipIndex } from './organization-ownership';

describe('organization ownership index', () => {
  it('indexes base account IDs and aliases', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111', account_alias: 'company-a' }],
          projects: {},
        },
      },
    });

    if (!('organizations' in config)) {
      throw new Error('Expected Organization Mode.');
    }

    const index = buildOrganizationOwnershipIndex(config);

    expect(index.baseAccountIds.get('111111111111')).toBe('engineering');
    expect(index.baseAccountAliases.get('company-a')).toBe('engineering');
    expect(index.accountIds.get('111111111111')).toBe('engineering');
  });

  it('indexes multiple base accounts for one organization', () => {
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
          projects: {},
        },
      },
    });

    if (!('organizations' in config)) {
      throw new Error('Expected Organization Mode.');
    }

    const index = buildOrganizationOwnershipIndex(config);

    expect(index.baseAccountIds.get('111111111111')).toBe('engineering');
    expect(index.baseAccountIds.get('111111111112')).toBe('engineering');

    expect(index.baseAccountAliases.get('engineering-root')).toBe('engineering');
    expect(index.baseAccountAliases.get('engineering-sso')).toBe('engineering');

    expect(index.accountIds.get('111111111111')).toBe('engineering');
    expect(index.accountIds.get('111111111112')).toBe('engineering');
  });

  it('indexes project member accounts', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111' }],
          projects: { atlas: { accounts: { prod: '111111111112' } } },
        },
      },
    });

    if (!('organizations' in config)) {
      throw new Error('Expected Organization Mode.');
    }

    const index = buildOrganizationOwnershipIndex(config);

    expect(index.accountIds.get('111111111112')).toBe('engineering');
  });

  it('resolves a same-organization base and project account to one owner', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111' }],
          projects: { platform: { accounts: { base: '111111111111' } } },
        },
      },
    });

    if (!('organizations' in config)) {
      throw new Error('Expected Organization Mode.');
    }

    const index = buildOrganizationOwnershipIndex(config);

    expect(index.accountIds.get('111111111111')).toBe('engineering');
  });

  it('keeps different organizations isolated', () => {
    const config = normalizeRooConfigV2({
      version: 2,
      organizations: {
        engineering: {
          base_accounts: [{ account_id: '111111111111', account_alias: 'company-a' }],
          projects: { atlas: { accounts: { prod: '111111111112' } } },
        },
        corporate: {
          base_accounts: [{ account_id: '222222222222', account_alias: 'company-b' }],
          projects: { atlas: { accounts: { prod: '222222222223' } } },
        },
      },
    });

    if (!('organizations' in config)) {
      throw new Error('Expected Organization Mode.');
    }

    const index = buildOrganizationOwnershipIndex(config);

    expect(index.accountIds.get('111111111112')).toBe('engineering');
    expect(index.accountIds.get('222222222223')).toBe('corporate');
  });

  it('throws instead of choosing the first or last owner for conflicting data', () => {
    const conflictingConfig: RooConfigV2Organizations = {
      version: 2,
      organizations: {
        engineering: {
          baseAccounts: [{ accountId: '111111111111' }],
          defaults: { enabled: false, roles: [] },
          projects: {},
        },
        corporate: {
          baseAccounts: [{ accountId: '111111111111' }],
          defaults: { enabled: false, roles: [] },
          projects: {},
        },
      },
    };

    expect(() => buildOrganizationOwnershipIndex(conflictingConfig)).toThrow(
      'Base account ID 111111111111 has conflicting ownership',
    );
  });
});
