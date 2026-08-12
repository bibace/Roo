import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POPUP_BOOTSTRAP_REQUEST } from './bootstrap-protocol';

const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: { runtime: { sendMessage } },
}));

import { loadPopupBootstrap } from './load-effective-targets';

const bootstrap = {
  targets: [],
  catalogStatus: 'empty' as const,
  summary: { accounts: 0, roles: 0 },
  searchEnabled: true,
};

describe('loadPopupBootstrap', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  it('sends exactly one GET_POPUP_BOOTSTRAP request and returns the bootstrap', async () => {
    sendMessage.mockResolvedValue({ ok: true, bootstrap });

    await expect(loadPopupBootstrap()).resolves.toEqual(bootstrap);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(POPUP_BOOTSTRAP_REQUEST);
  });

  it('throws on transport failure', async () => {
    sendMessage.mockRejectedValue(new Error('transport failed'));

    await expect(loadPopupBootstrap()).rejects.toThrow('Unable to load Roo popup.');
  });

  it('throws on a malformed response', async () => {
    sendMessage.mockResolvedValue({ ok: true, bootstrap: { targets: [] } });

    await expect(loadPopupBootstrap()).rejects.toThrow('Unable to load Roo popup.');
  });

  it('throws on an error response', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: { message: 'Unable to load Roo popup.' } });

    await expect(loadPopupBootstrap()).rejects.toThrow('Unable to load Roo popup.');
  });
});
