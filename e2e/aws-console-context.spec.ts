import { expect, test, type Page } from '@playwright/test';
import { readAwsConsolePageSnapshot } from '../src/aws-context/page-snapshot';

async function readSnapshot(page: Page, html: string) {
  await page.setContent(html);
  return page.evaluate(readAwsConsolePageSnapshot);
}

test.describe('AWS Console page snapshot extractor in real Chromium', () => {
  test('extracts account values from ConsoleNavService.AccountInfo', async ({ page }) => {
    const snapshot = await readSnapshot(
      page,
      `
        <script>
          globalThis.ConsoleNavService = {
            AccountInfo: {
              loginDisplayNameAccount: '111111111111',
              roleDisplayNameAccount: '222222222222'
            }
          };
        </script>
      `,
    );

    expect(snapshot).toEqual({
      loginDisplayNameAccount: '111111111111',
      roleDisplayNameAccount: '222222222222',
      multiSession: false,
      source: 'console-nav',
    });
  });

  test('uses the AWS DOM account fields when ConsoleNavService is unavailable', async ({ page }) => {
    const snapshot = await readSnapshot(
      page,
      `
        <span id="awsc-login-display-name-account">1234-5678-9012</span>
        <span id="awsc-role-display-name-account">9999-8888-7777</span>
      `,
    );

    expect(snapshot).toEqual({
      loginDisplayNameAccount: '1234-5678-9012',
      roleDisplayNameAccount: '9999-8888-7777',
      multiSession: false,
      source: 'dom',
    });
  });

  test('retains prismModeEnabled as the only multi-session signal', async ({ page }) => {
    const snapshot = await readSnapshot(
      page,
      `
        <meta
          name="awsc-session-data"
          content='{"prismModeEnabled":true,"unrelated":"discard-me"}'
        >
        <span id="awsc-login-display-name-account">111111111111</span>
      `,
    );

    expect(snapshot.multiSession).toBe(true);
    expect(snapshot).not.toHaveProperty('unrelated');
  });

  test('does not return unrelated ConsoleNavService.AccountInfo fields', async ({ page }) => {
    const snapshot = await readSnapshot(
      page,
      `
        <script>
          globalThis.ConsoleNavService = {
            AccountInfo: {
              loginDisplayNameAccount: '111111111111',
              roleDisplayNameAccount: '222222222222',
              userName: 'do-not-return',
              sessionToken: 'do-not-return',
              roleName: 'do-not-return'
            }
          };
        </script>
      `,
    );

    expect(snapshot).toEqual({
      loginDisplayNameAccount: '111111111111',
      roleDisplayNameAccount: '222222222222',
      multiSession: false,
      source: 'console-nav',
    });
  });

  test('does not read the AWS DOM user fields', async ({ page }) => {
    const snapshot = await readSnapshot(
      page,
      `
        <span id="awsc-login-display-name-user">login-secret-sentinel</span>
        <span id="awsc-role-display-name-user">role-secret-sentinel</span>
      `,
    );

    expect(JSON.stringify(snapshot)).not.toContain('secret-sentinel');
    expect(snapshot).toEqual({
      loginDisplayNameAccount: null,
      roleDisplayNameAccount: null,
      multiSession: false,
      source: 'dom',
    });
  });
});
