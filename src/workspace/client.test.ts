import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspaceView } from './workspace-view';

const sendMessage = vi.hoisted(() => vi.fn());

vi.mock('wxt/browser', () => ({
  browser: { runtime: { sendMessage } },
}));

import { deleteConfiguration, getWorkspace } from './client';

describe('Workspace client response boundary', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  it('maps an empty successful response to STORAGE_FAILED', async () => {
    sendMessage.mockResolvedValue({ ok: true });

    await expect(getWorkspace()).rejects.toMatchObject({
      code: 'STORAGE_FAILED',
      message: 'Unable to load Roo workspace.',
    });
  });

  it('maps a non-object successful response to STORAGE_FAILED', async () => {
    sendMessage.mockResolvedValue({
      ok: true,
      workspace: null,
    });

    await expect(getWorkspace()).rejects.toMatchObject({
      code: 'STORAGE_FAILED',
      message: 'Unable to load Roo workspace.',
    });
  });

  it('returns the Workspace View from a valid success envelope', async () => {
    const response = {
      ok: true as const,
      workspace: buildWorkspaceView({ status: 'empty' }),
    };
    response.workspace.summary.accounts = 3;
    sendMessage.mockResolvedValue(response);

    const workspace = await getWorkspace();

    expect(workspace.summary.accounts).toBe(3);
    expect(workspace).toBe(response.workspace);
  });

  it('propagates a valid typed failure envelope', async () => {
    sendMessage.mockResolvedValue({
      ok: false,
      error: { code: 'STALE_WORKSPACE', message: 'Configuration changed.' },
    });

    await expect(getWorkspace()).rejects.toMatchObject({
      code: 'STALE_WORKSPACE',
      message: 'Configuration changed.',
    });
  });

  it('sends an exact DELETE_CONFIGURATION request and returns its Workspace', async () => {
    const response = {
      ok: true as const,
      workspace: buildWorkspaceView({ status: 'empty' }),
    };
    sendMessage.mockResolvedValue(response);

    const workspace = await deleteConfiguration({
      expectedCatalogToken: { kind: 'ready', catalogVersion: 4 },
      confirmationFileName: 'team.json',
    });

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 4 },
      confirmationFileName: 'team.json',
    });
    expect(workspace).toBe(response.workspace);
  });
});
