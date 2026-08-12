import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAwsConsolePageSnapshot } from './page-snapshot';

describe('readAwsConsolePageSnapshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([true, 'true'])('treats prismModeEnabled=%j as Prism mode', (prismModeEnabled) => {
    vi.stubGlobal('document', {
      querySelector: vi.fn((selector: string) => {
        if (selector === 'meta[name="awsc-session-data"]') {
          return {
            getAttribute: () => JSON.stringify({ prismModeEnabled }),
          };
        }

        return null;
      }),
    });

    expect(readAwsConsolePageSnapshot().multiSession).toBe(true);
  });

  it.each([false, 'false', 1, null])(
    'treats prismModeEnabled=%j as Legacy mode',
    (prismModeEnabled) => {
      vi.stubGlobal('document', {
        querySelector: vi.fn((selector: string) => {
          if (selector === 'meta[name="awsc-session-data"]') {
            return {
              getAttribute: () => JSON.stringify({ prismModeEnabled }),
            };
          }

          return null;
        }),
      });

      expect(readAwsConsolePageSnapshot().multiSession).toBe(false);
    },
  );
});
