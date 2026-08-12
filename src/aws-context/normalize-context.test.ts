import { describe, expect, it } from 'vitest';
import {
  normalizeAwsAccountIdOrAlias,
  normalizeAwsConsolePageSnapshot,
} from './normalize-context';
import type { RawAwsConsolePageSnapshot } from './types';

function makeSnapshot(overrides: Partial<RawAwsConsolePageSnapshot> = {}): RawAwsConsolePageSnapshot {
  return {
    loginDisplayNameAccount: '123456789012',
    roleDisplayNameAccount: '123456789012',
    multiSession: false,
    source: 'dom',
    ...overrides,
  };
}

describe('normalizeAwsAccountIdOrAlias', () => {
  it('accepts a plain 12-digit account ID', () => {
    expect(normalizeAwsAccountIdOrAlias('123456789012')).toBe('123456789012');
  });

  it('normalizes a hyphenated 4-4-4 account ID', () => {
    expect(normalizeAwsAccountIdOrAlias('1234-5678-9012')).toBe('123456789012');
  });

  it('accepts a valid lowercase account alias', () => {
    expect(normalizeAwsAccountIdOrAlias('company-prod-1')).toBe('company-prod-1');
  });

  it('trims outer whitespace before validation', () => {
    expect(normalizeAwsAccountIdOrAlias('  1234-5678-9012  ')).toBe('123456789012');
    expect(normalizeAwsAccountIdOrAlias('  company-prod  ')).toBe('company-prod');
  });

  it('rejects uppercase aliases without lowercasing them', () => {
    expect(normalizeAwsAccountIdOrAlias('Company-Prod')).toBeNull();
  });

  it.each(['ab', '-company', 'company-', 'company_name', 'company name'])('rejects invalid aliases: %s', (value) => {
    expect(normalizeAwsAccountIdOrAlias(value)).toBeNull();
  });

  it.each(['12345678901_', '1234567890123_', '1234-567-9012_', 'not_an_account'])('rejects invalid account values: %s', (value) => {
    expect(normalizeAwsAccountIdOrAlias(value)).toBeNull();
  });
});

describe('normalizeAwsConsolePageSnapshot', () => {
  it('prefers the valid role/current account over the login account', () => {
    expect(
      normalizeAwsConsolePageSnapshot(
        makeSnapshot({
          loginDisplayNameAccount: '111111111111',
          roleDisplayNameAccount: '2222-2222-2222',
        }),
      ),
    ).toEqual({
      status: 'ready',
      context: {
        loginAccountIdOrAlias: '111111111111',
        currentAccountIdOrAlias: '222222222222',
        multiSession: false,
        source: 'dom',
      },
    });
  });

  it('falls back to the login account when the role/current account is invalid', () => {
    expect(
      normalizeAwsConsolePageSnapshot(
        makeSnapshot({
          loginDisplayNameAccount: 'company-prod',
          roleDisplayNameAccount: 'not valid',
        }),
      ),
    ).toEqual({
      status: 'ready',
      context: {
        loginAccountIdOrAlias: 'company-prod',
        currentAccountIdOrAlias: 'company-prod',
        multiSession: false,
        source: 'dom',
      },
    });
  });

  it('accepts a valid current account when login is null', () => {
    expect(
      normalizeAwsConsolePageSnapshot(
        makeSnapshot({
          loginDisplayNameAccount: null,
          roleDisplayNameAccount: 'company-prod',
        }),
      ),
    ).toMatchObject({
      status: 'ready',
      context: {
        loginAccountIdOrAlias: null,
        currentAccountIdOrAlias: 'company-prod',
      },
    });
  });

  it('returns unavailable when both account fields are invalid', () => {
    expect(
      normalizeAwsConsolePageSnapshot(
        makeSnapshot({
          loginDisplayNameAccount: 'invalid login',
          roleDisplayNameAccount: 'invalid role',
        }),
      ),
    ).toEqual({ status: 'unavailable' });
  });

  it('preserves multi-session and source markers', () => {
    expect(
      normalizeAwsConsolePageSnapshot(
        makeSnapshot({ multiSession: true, source: 'console-nav' }),
      ),
    ).toEqual({
      status: 'ready',
      context: {
        loginAccountIdOrAlias: '123456789012',
        currentAccountIdOrAlias: '123456789012',
        multiSession: true,
        source: 'console-nav',
      },
    });
  });

  it('does not throw for malformed page-provided account strings', () => {
    expect(() =>
      normalizeAwsConsolePageSnapshot(
        makeSnapshot({
          loginDisplayNameAccount: ' '.repeat(3),
          roleDisplayNameAccount: 'x'.repeat(64),
        }),
      ),
    ).not.toThrow();
  });
});
