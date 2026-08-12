import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAwsConsolePageSnapshot } from './page-snapshot';
import type { RawAwsConsolePageSnapshot } from './types';

const { executeScript } = vi.hoisted(() => ({
  executeScript: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    scripting: { executeScript },
  },
}));

import { getAwsConsoleContextProbeForTab } from './get-aws-console-context';

const supportedAwsUrl = 'https://us-east-1.console.aws.amazon.com';

function injectedResult(snapshot: RawAwsConsolePageSnapshot) {
  return [{ frameId: 0, result: snapshot }];
}

function validSnapshot(): RawAwsConsolePageSnapshot {
  return {
    loginDisplayNameAccount: '1234-5678-9012',
    roleDisplayNameAccount: 'company-prod',
    multiSession: true,
    source: 'console-nav',
  };
}

describe('getAwsConsoleContextProbeForTab', () => {
  beforeEach(() => {
    executeScript.mockReset();
  });

  it('reads a supported tab in MAIN world', async () => {
    executeScript.mockResolvedValue(injectedResult(validSnapshot()));

    await expect(getAwsConsoleContextProbeForTab(9, supportedAwsUrl)).resolves.toEqual({
      tabId: 9,
      result: {
        status: 'ready',
        context: {
          loginAccountIdOrAlias: '123456789012',
          currentAccountIdOrAlias: 'company-prod',
          multiSession: true,
          source: 'console-nav',
        },
      },
    });
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 9 },
      world: 'MAIN',
      func: readAwsConsolePageSnapshot,
    });
  });

  it('falls back to ISOLATED exactly once after MAIN execution fails', async () => {
    executeScript
      .mockRejectedValueOnce(new Error('MAIN execution failed'))
      .mockResolvedValueOnce(injectedResult(validSnapshot()));

    await expect(getAwsConsoleContextProbeForTab(9, supportedAwsUrl)).resolves.toMatchObject({
      tabId: 9,
      result: { status: 'ready' },
    });
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(executeScript.mock.calls[0]?.[0].world).toBe('MAIN');
    expect(executeScript.mock.calls[1]?.[0].world).toBe('ISOLATED');
  });

  it('returns unavailable when both execution worlds fail', async () => {
    executeScript
      .mockRejectedValueOnce(new Error('MAIN execution failed'))
      .mockRejectedValueOnce(new Error('ISOLATED execution failed'));

    await expect(getAwsConsoleContextProbeForTab(9, supportedAwsUrl)).resolves.toEqual({
      tabId: 9,
      result: { status: 'unavailable' },
    });
  });

  it('returns not-aws-console without executing for an unsupported URL', async () => {
    await expect(getAwsConsoleContextProbeForTab(9, 'https://example.com')).resolves.toEqual({
      tabId: 9,
      result: { status: 'not-aws-console' },
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('returns unavailable for a malformed injected result', async () => {
    executeScript.mockResolvedValue([{
      frameId: 0,
      result: {
        loginDisplayNameAccount: 123,
        roleDisplayNameAccount: null,
        multiSession: true,
        source: 'dom',
      },
    }]);

    await expect(getAwsConsoleContextProbeForTab(9, supportedAwsUrl)).resolves.toEqual({
      tabId: 9,
      result: { status: 'unavailable' },
    });
  });

  it.each([
    [Number.NaN, supportedAwsUrl],
    [7, undefined],
  ])('returns unavailable for an invalid tab boundary: %j', async (tabId, url) => {
    await expect(getAwsConsoleContextProbeForTab(tabId, url)).resolves.toEqual({
      tabId: typeof tabId === 'number' && Number.isInteger(tabId) ? tabId : null,
      result: { status: 'unavailable' },
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('targets only the active tab top frame', async () => {
    executeScript.mockResolvedValue(injectedResult(validSnapshot()));

    await getAwsConsoleContextProbeForTab(7, supportedAwsUrl);

    const request = executeScript.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request.target).toEqual({ tabId: 7 });
    expect(request).not.toHaveProperty('allFrames');
    expect(request.target).not.toHaveProperty('frameIds');
  });
});
