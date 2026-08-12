import type { AwsConsoleContextResult, RawAwsConsolePageSnapshot } from './types';

const accountAliasPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function normalizeAwsAccountIdOrAlias(value: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  if (/^\d{12}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  if (/^\d{4}-\d{4}-\d{4}$/.test(trimmedValue)) {
    return trimmedValue.replaceAll('-', '');
  }

  if (
    trimmedValue.length >= 3 &&
    trimmedValue.length <= 63 &&
    accountAliasPattern.test(trimmedValue)
  ) {
    return trimmedValue;
  }

  return null;
}

export function normalizeAwsConsolePageSnapshot(
  snapshot: RawAwsConsolePageSnapshot,
): AwsConsoleContextResult {
  const loginAccountIdOrAlias = normalizeAwsAccountIdOrAlias(snapshot.loginDisplayNameAccount);
  const normalizedCurrentAccount = normalizeAwsAccountIdOrAlias(snapshot.roleDisplayNameAccount);
  const currentAccountIdOrAlias = normalizedCurrentAccount ?? loginAccountIdOrAlias;

  if (loginAccountIdOrAlias === null && currentAccountIdOrAlias === null) {
    return { status: 'unavailable' };
  }

  return {
    status: 'ready',
    context: {
      loginAccountIdOrAlias,
      currentAccountIdOrAlias,
      multiSession: snapshot.multiSession,
      source: snapshot.source,
    },
  };
}
