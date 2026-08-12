import { browser } from 'wxt/browser';
import { normalizeAwsConsolePageSnapshot } from './normalize-context';
import { readAwsConsolePageSnapshot } from './page-snapshot';
import { isSupportedAwsConsoleUrl } from './supported-url';
import type {
  AwsConsoleContextResult,
  AwsConsoleContextProbe,
  AwsConsoleContextSource,
  RawAwsConsolePageSnapshot,
} from './types';

function unavailable(): AwsConsoleContextResult {
  return { status: 'unavailable' };
}

function isAccountValue(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isSource(value: unknown): value is AwsConsoleContextSource {
  return value === 'console-nav' || value === 'dom';
}

function parseInjectedSnapshot(value: unknown): RawAwsConsolePageSnapshot | null {
  if (!Array.isArray(value) || value.length !== 1) {
    return null;
  }

  const injectionResult = value[0];

  if (typeof injectionResult !== 'object' || injectionResult === null || !('result' in injectionResult)) {
    return null;
  }

  const snapshot = injectionResult.result;

  if (typeof snapshot !== 'object' || snapshot === null) {
    return null;
  }

  const candidate = snapshot as Record<string, unknown>;

  if (
    !isAccountValue(candidate.loginDisplayNameAccount) ||
    !isAccountValue(candidate.roleDisplayNameAccount) ||
    typeof candidate.multiSession !== 'boolean' ||
    !isSource(candidate.source)
  ) {
    return null;
  }

  return {
    loginDisplayNameAccount: candidate.loginDisplayNameAccount,
    roleDisplayNameAccount: candidate.roleDisplayNameAccount,
    multiSession: candidate.multiSession,
    source: candidate.source,
  };
}

async function executeSnapshot(tabId: number, world: 'MAIN' | 'ISOLATED'): Promise<unknown> {
  return browser.scripting.executeScript({
    target: { tabId },
    world,
    func: readAwsConsolePageSnapshot,
  });
}

function isValidTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export async function getAwsConsoleContextProbeForTab(
  tabId: number,
  url: string | undefined,
): Promise<AwsConsoleContextProbe> {
  if (!isValidTabId(tabId)) {
    return { tabId: null, result: unavailable() };
  }

  if (url === undefined) {
    return { tabId, result: unavailable() };
  }

  if (!isSupportedAwsConsoleUrl(url)) {
    return { tabId, result: { status: 'not-aws-console' } };
  }

  let executionResult: unknown;

  try {
    executionResult = await executeSnapshot(tabId, 'MAIN');
  } catch {
    try {
      executionResult = await executeSnapshot(tabId, 'ISOLATED');
    } catch {
      return { tabId, result: unavailable() };
    }
  }

  const snapshot = parseInjectedSnapshot(executionResult);

  if (snapshot === null) {
    return { tabId, result: unavailable() };
  }

  return { tabId, result: normalizeAwsConsolePageSnapshot(snapshot) };
}
