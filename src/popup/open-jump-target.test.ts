import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JumpTarget } from '../domain/jump-target';
import { AwsJumpError } from '../navigation/aws-jump-error';
import { submitAwsSwitchRoleInPage } from '../navigation/submit-aws-switch-role';

const { tabsQuery, executeScript } = vi.hoisted(() => ({
  tabsQuery: vi.fn(),
  executeScript: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      query: tabsQuery,
    },
    scripting: {
      executeScript,
    },
  },
}));

import { openJumpTarget } from './open-jump-target';

function makeTarget(overrides: Partial<JumpTarget> = {}): JumpTarget {
  return {
    accountId: '123456789012',
    accountName: 'atlas-prod',
    project: 'atlas',
    environment: 'prod',
    role: 'platform/security-admin',
    roleShortName: 'security-admin',
    ...overrides,
  };
}

const activeAwsTab = {
  id: 17,
  url: 'https://us-east-1.console.aws.amazon.com/console/home',
};

describe('openJumpTarget', () => {
  beforeEach(() => {
    tabsQuery.mockReset();
    executeScript.mockReset();
    tabsQuery.mockResolvedValue([activeAwsTab]);
    executeScript.mockResolvedValue([
      { frameId: 0, result: { status: 'submitted', mode: 'legacy' } },
    ]);
  });

  it('submits one MAIN-world request in the supported active AWS tab', async () => {
    const target = makeTarget();

    await openJumpTarget(target);

    expect(tabsQuery).toHaveBeenCalledTimes(1);
    expect(tabsQuery).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: activeAwsTab.id },
      world: 'MAIN',
      func: submitAwsSwitchRoleInPage,
      args: [{
        endpoint: 'https://signin.aws.amazon.com/switchrole',
        account: target.accountId,
        roleName: target.role,
        displayName: 'atlas-prod | 123456789012',
      }],
    });
    expect(executeScript.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      target: { tabId: activeAwsTab.id },
      world: 'MAIN',
    }));
    expect(executeScript.mock.calls[0]?.[0]).not.toHaveProperty('allFrames');
    expect(executeScript.mock.calls[0]?.[0]).not.toHaveProperty('subframes');
  });

  it('resolves a Prism submitted result', async () => {
    executeScript.mockResolvedValue([{ frameId: 0, result: { status: 'submitted', mode: 'prism' } }]);

    await expect(openJumpTarget(makeTarget())).resolves.toBeUndefined();
  });

  it('rejects an unsupported active tab without executing a script', async () => {
    tabsQuery.mockResolvedValue([{ id: 17, url: 'https://example.com' }]);

    await expect(openJumpTarget(makeTarget())).rejects.toMatchObject({
      code: 'ACTIVE_TAB_UNSUPPORTED',
      message: 'ACTIVE_TAB_UNSUPPORTED',
    });

    expect(executeScript).not.toHaveBeenCalled();
  });

  it('rejects when the active tab is missing', async () => {
    tabsQuery.mockResolvedValue([]);

    await expect(openJumpTarget(makeTarget())).rejects.toMatchObject({
      code: 'ACTIVE_TAB_NOT_FOUND',
      message: 'ACTIVE_TAB_NOT_FOUND',
    });

    expect(executeScript).not.toHaveBeenCalled();
  });

  it('rejects when the active tab has no numeric ID', async () => {
    tabsQuery.mockResolvedValue([{ url: activeAwsTab.url }]);

    await expect(openJumpTarget(makeTarget())).rejects.toMatchObject({
      code: 'ACTIVE_TAB_UNSUPPORTED',
    });

    expect(executeScript).not.toHaveBeenCalled();
  });

  it('rejects when more than one active tab is returned', async () => {
    tabsQuery.mockResolvedValue([activeAwsTab, activeAwsTab]);

    await expect(openJumpTarget(makeTarget())).rejects.toMatchObject({
      code: 'ACTIVE_TAB_NOT_FOUND',
    });

    expect(executeScript).not.toHaveBeenCalled();
  });

  it('validates the target before querying browser tabs', async () => {
    await expect(
      openJumpTarget(makeTarget({ accountId: 'not-an-account' })),
    ).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_ID' });

    expect(tabsQuery).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('propagates executeScript failures', async () => {
    executeScript.mockRejectedValue(new Error('script execution failed'));

    await expect(openJumpTarget(makeTarget())).rejects.toMatchObject({
      code: 'SCRIPTING_FAILED',
      message: 'SCRIPTING_FAILED',
    });
  });

  it.each([
    'LEGACY_CSRF_UNAVAILABLE',
    'PRISM_SESSION_MISSING',
    'PRISM_HTTP_FAILED',
    'PRISM_RESPONSE_INVALID',
    'PRISM_DESTINATION_INVALID',
  ] as const)('propagates executor failure code %s', async (reason) => {
    executeScript.mockResolvedValue([{ frameId: 0, result: { status: 'unavailable', reason } }]);

    await expect(openJumpTarget(makeTarget())).rejects.toMatchObject({
      code: reason,
      message: reason,
    });
  });

  it('rejects a missing executor result', async () => {
    executeScript.mockResolvedValue([{ frameId: 0 }]);

    await expect(openJumpTarget(makeTarget())).rejects.toMatchObject({
      code: 'EXECUTOR_RESULT_INVALID',
      message: 'EXECUTOR_RESULT_INVALID',
    });
  });

  it('rejects an invalid executor failure result', async () => {
    executeScript.mockResolvedValue([{ frameId: 0, result: { status: 'unavailable' } }]);

    await expect(openJumpTarget(makeTarget())).rejects.toMatchObject({
      code: 'EXECUTOR_RESULT_INVALID',
    });
  });

  it('rejects a primitive executor result', async () => {
    executeScript.mockResolvedValue([1]);

    await expect(openJumpTarget(makeTarget())).rejects.toMatchObject({
      code: 'EXECUTOR_RESULT_INVALID',
    });
  });

  it('uses the typed error for active tab query failures', async () => {
    tabsQuery.mockRejectedValue(new Error('query failed'));

    await expect(openJumpTarget(makeTarget())).rejects.toBeInstanceOf(AwsJumpError);
    await expect(openJumpTarget(makeTarget())).rejects.toMatchObject({
      code: 'ACTIVE_TAB_NOT_FOUND',
    });
  });
});
