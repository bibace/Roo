import { browser } from 'wxt/browser';
import type { JumpTarget } from '../domain/jump-target';
import { isSupportedAwsConsoleUrl } from '../aws-context/supported-url';
import { buildAwsSwitchRoleRequest } from '../navigation/build-aws-switch-role-request';
import { AwsJumpError } from '../navigation/aws-jump-error';
import type { AwsJumpFailureCode } from '../navigation/aws-jump-result';
import { submitAwsSwitchRoleInPage } from '../navigation/submit-aws-switch-role';

const awsJumpFailureCodes: readonly AwsJumpFailureCode[] = [
  'INVALID_REQUEST',
  'SESSION_METADATA_INVALID',
  'SIGNIN_ENDPOINT_INVALID',
  'PRISM_SESSION_MISSING',
  'PRISM_REQUEST_FAILED',
  'PRISM_HTTP_FAILED',
  'PRISM_RESPONSE_INVALID',
  'PRISM_DESTINATION_INVALID',
  'LEGACY_CSRF_UNAVAILABLE',
  'DOCUMENT_BODY_UNAVAILABLE',
];

function isAwsJumpFailureCode(value: unknown): value is AwsJumpFailureCode {
  return typeof value === 'string' && awsJumpFailureCodes.includes(value as AwsJumpFailureCode);
}

function isSubmittedResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('status' in value)) {
    return false;
  }

  return (
    Object.keys(value).length === 2 &&
    value.status === 'submitted' &&
    'mode' in value &&
    (value.mode === 'legacy' || value.mode === 'prism')
  );
}

function isUnavailableResult(value: unknown): value is { status: 'unavailable'; reason: AwsJumpFailureCode } {
  if (typeof value !== 'object' || value === null || !('status' in value)) {
    return false;
  }

  return (
    Object.keys(value).length === 2 &&
    value.status === 'unavailable' &&
    'reason' in value &&
    isAwsJumpFailureCode(value.reason)
  );
}

function getExecutorFailureCode(value: unknown): AwsJumpFailureCode | null {
  if (isUnavailableResult(value)) {
    return value.reason;
  }

  return null;
}

function hasExecutorResult(value: unknown): value is { result: unknown } {
  return typeof value === 'object' && value !== null && 'result' in value;
}

export async function openJumpTarget(target: JumpTarget): Promise<void> {
  const request = buildAwsSwitchRoleRequest(target);
  let tabs: unknown;

  try {
    tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
  } catch {
    throw new AwsJumpError('ACTIVE_TAB_NOT_FOUND');
  }

  if (!Array.isArray(tabs) || tabs.length !== 1) {
    throw new AwsJumpError('ACTIVE_TAB_NOT_FOUND');
  }

  const tab = tabs[0];

  if (
    !tab ||
    typeof tab.id !== 'number' ||
    typeof tab.url !== 'string' ||
    !isSupportedAwsConsoleUrl(tab.url)
  ) {
    throw new AwsJumpError('ACTIVE_TAB_UNSUPPORTED');
  }

  let results: unknown;

  try {
    results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: submitAwsSwitchRoleInPage,
      args: [request],
    });
  } catch {
    throw new AwsJumpError('SCRIPTING_FAILED');
  }

  if (!Array.isArray(results) || results.length !== 1 || !hasExecutorResult(results[0])) {
    throw new AwsJumpError('EXECUTOR_RESULT_INVALID');
  }

  const result = results[0]?.result;
  const failureCode = getExecutorFailureCode(result);

  if (failureCode !== null) {
    throw new AwsJumpError(failureCode);
  }

  if (!isSubmittedResult(result)) {
    throw new AwsJumpError('EXECUTOR_RESULT_INVALID');
  }
}
