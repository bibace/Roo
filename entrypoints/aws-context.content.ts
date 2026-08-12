import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { SUPPORTED_AWS_CONSOLE_MATCH_PATTERNS } from '../src/aws-context/supported-url';

const REFRESH_DEBOUNCE_MS = 150;
const refreshMessage = { type: 'AWS_TAB_CONTEXT_REFRESH' } as const;

function sendRefresh(): void {
  try {
    void browser.runtime.sendMessage(refreshMessage).catch(() => undefined);
  } catch {
    // The tab may be tearing down while the content lifecycle is notifying Roo.
  }
}

export default defineContentScript({
  matches: [...SUPPORTED_AWS_CONSOLE_MATCH_PATTERNS],
  main() {
    let refreshTimeout: ReturnType<typeof setTimeout> | undefined;

    const requestRefresh = () => {
      if (refreshTimeout !== undefined) {
        clearTimeout(refreshTimeout);
      }

      refreshTimeout = setTimeout(() => {
        refreshTimeout = undefined;
        sendRefresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    window.addEventListener('pageshow', requestRefresh);
    window.addEventListener('focus', requestRefresh);
    window.addEventListener('popstate', requestRefresh);
    window.addEventListener('hashchange', requestRefresh);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        requestRefresh();
      }
    });

    sendRefresh();
  },
});
