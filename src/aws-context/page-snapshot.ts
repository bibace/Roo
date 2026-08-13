import type { RawAwsConsolePageSnapshot } from './types';

export function readAwsConsolePageSnapshot(): RawAwsConsolePageSnapshot {
  const readAccountString = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmedValue = value.trim();

    if (trimmedValue.length === 0 || trimmedValue.length > 63) {
      return null;
    }

    return trimmedValue;
  };

  const consoleNavService = (
    globalThis as {
      ConsoleNavService?: {
        AccountInfo?: {
          loginDisplayNameAccount?: unknown;
          roleDisplayNameAccount?: unknown;
        };
      };
    }
  ).ConsoleNavService;
  const accountInfo = consoleNavService?.AccountInfo;
  const loginFromConsoleNav = readAccountString(accountInfo?.loginDisplayNameAccount);
  const roleFromConsoleNav = readAccountString(accountInfo?.roleDisplayNameAccount);
  const loginFromDom = readAccountString(
    document.querySelector('#awsc-login-display-name-account')?.textContent,
  );
  const roleFromDom = readAccountString(
    document.querySelector('#awsc-role-display-name-account')?.textContent,
  );

  let multiSession = false;
  const sessionData = document.querySelector('meta[name="awsc-session-data"]')?.getAttribute('content');

  if (sessionData) {
    try {
      const parsed = JSON.parse(sessionData) as { prismModeEnabled?: unknown } | null;
      multiSession =
        parsed !== null &&
        typeof parsed === 'object' &&
        (parsed.prismModeEnabled === true || parsed.prismModeEnabled === 'true');
    } catch {
      multiSession = false;
    }
  }

  const loginDisplayNameAccount = loginFromConsoleNav ?? loginFromDom;
  const roleDisplayNameAccount = roleFromConsoleNav ?? roleFromDom;

  return {
    loginDisplayNameAccount,
    roleDisplayNameAccount,
    multiSession,
    source: loginFromConsoleNav !== null || roleFromConsoleNav !== null ? 'console-nav' : 'dom',
  };
}
