import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openOptionsPage } = vi.hoisted(() => ({
  openOptionsPage: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { openOptionsPage },
  },
}));

import { openSettings } from './open-settings';

describe('openSettings', () => {
  beforeEach(() => {
    openOptionsPage.mockReset();
    openOptionsPage.mockResolvedValue(undefined);
  });

  it('opens the generated Options Page exactly once per activation', async () => {
    await openSettings();

    expect(openOptionsPage).toHaveBeenCalledTimes(1);
    expect(openOptionsPage).toHaveBeenCalledWith();
  });

  it('propagates Options Page opening failures to the Popup integration path', async () => {
    const failure = new Error('options page failed');
    openOptionsPage.mockRejectedValue(failure);

    await expect(openSettings()).rejects.toBe(failure);
  });
});
