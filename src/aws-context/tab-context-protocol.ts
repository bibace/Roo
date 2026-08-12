import type { AwsConsoleContextProbe, AwsConsoleContextResult } from './types';

const requestTypes = new Set([
  'AWS_TAB_CONTEXT_REFRESH',
  'GET_ACTIVE_AWS_TAB_CONTEXT',
] as const);

export type AwsTabContextRequest =
  | { type: 'AWS_TAB_CONTEXT_REFRESH' }
  | { type: 'GET_ACTIVE_AWS_TAB_CONTEXT' };

export type AwsTabContextSuccessResponse = {
  ok: true;
  probe: AwsConsoleContextProbe;
};
export type AwsTabContextFailureResponse = {
  ok: false;
  error: {
    code: 'INVALID_REQUEST' | 'TAB_UNAVAILABLE';
    message: string;
  };
};
export type AwsTabContextResponse = AwsTabContextSuccessResponse | AwsTabContextFailureResponse;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

function isValidTabId(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

function parseProbe(value: unknown): AwsConsoleContextProbe | undefined {
  if (!isObject(value) || !hasExactKeys(value, ['tabId', 'result']) || !isValidTabId(value.tabId)) {
    return undefined;
  }

  if (!isObject(value.result) || typeof value.result.status !== 'string') {
    return undefined;
  }

  if (value.result.status === 'ready') {
    if (
      !hasExactKeys(value.result, ['status', 'context']) ||
      !isObject(value.result.context)
    ) {
      return undefined;
    }
  } else if (
    (value.result.status !== 'unavailable' && value.result.status !== 'not-aws-console') ||
    !hasExactKeys(value.result, ['status'])
  ) {
    return undefined;
  }

  return value as unknown as AwsConsoleContextProbe;
}

export function parseAwsTabContextRequest(value: unknown): AwsTabContextRequest | undefined {
  if (!isObject(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'type')) {
    return undefined;
  }

  return requestTypes.has(value.type as AwsTabContextRequest['type'])
    ? value as AwsTabContextRequest
    : undefined;
}

export function parseAwsTabContextResponse(value: unknown): AwsTabContextResponse | undefined {
  if (!isObject(value) || typeof value.ok !== 'boolean') {
    return undefined;
  }

  if (value.ok) {
    if (!hasExactKeys(value, ['ok', 'probe'])) {
      return undefined;
    }

    const probe = parseProbe(value.probe);
    return probe === undefined ? undefined : { ok: true, probe };
  }

  if (!hasExactKeys(value, ['ok', 'error']) || !isObject(value.error)) {
    return undefined;
  }

  if (
    !hasExactKeys(value.error, ['code', 'message']) ||
    (value.error.code !== 'INVALID_REQUEST' && value.error.code !== 'TAB_UNAVAILABLE') ||
    typeof value.error.message !== 'string' ||
    value.error.message.length === 0
  ) {
    return undefined;
  }

  return {
    ok: false,
    error: {
      code: value.error.code,
      message: value.error.message,
    },
  };
}

export type { AwsConsoleContextProbe, AwsConsoleContextResult };
