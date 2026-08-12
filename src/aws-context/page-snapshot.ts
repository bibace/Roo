import type { RawAwsConsolePageSnapshot } from './types';

export function readAwsConsolePageSnapshot(): RawAwsConsolePageSnapshot {
  const readNonEmptyString = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    return value;
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
  const loginFromConsoleNav = readNonEmptyString(accountInfo?.loginDisplayNameAccount);
  const roleFromConsoleNav = readNonEmptyString(accountInfo?.roleDisplayNameAccount);
  const loginFromDom = readNonEmptyString(
    document.querySelector('#awsc-login-display-name-account')?.textContent,
  );
  const roleFromDom = readNonEmptyString(
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
