import { browser } from 'wxt/browser';

export function openSettings(): Promise<void> {
  return browser.runtime.openOptionsPage();
}
