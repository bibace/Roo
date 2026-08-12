import { test as base, expect, type Page } from '@playwright/test';
import {
  attachRooActionPopupForPage,
  closeRooExtension,
  isRooActionEnabledForPage,
  launchRooExtension,
  openRooActionPopupForPage,
  openRooTestTab,
  triggerRooActionForPage,
  type RooExtension,
} from './fixtures';
import {
  parseAwsTabContextResponse,
  type AwsTabContextResponse,
} from '../src/aws-context/tab-context-protocol';

const test = base.extend<{ roo: RooExtension & { userDataDirectory: string } }>({
  roo: async ({}, use) => {
    const roo = await launchRooExtension();

    try {
      await roo.clearStorage();
      await use(roo);
    } finally {
      try {
        await roo.assertNoRuntimeErrors();
      } finally {
        await closeRooExtension(roo);
      }
    }
  },
});

const supportedUrls = [
  'https://console.aws.amazon.com/console/home',
  'https://us-east-1.console.aws.amazon.com/console/home',
  'https://health.aws.amazon.com/health/home',
  'https://lightsail.aws.amazon.com/ls/webapp/home',
];

const unsupportedUrls = [
  'https://example.com/',
  'https://signin.aws.amazon.com/switchrole',
  'https://us-gov-west-1.console.amazonaws-us-gov.com/',
  'https://console.amazonaws.cn/',
];

async function expectRooActionDisabled(
  roo: RooExtension,
  page: Page,
): Promise<void> {
  await page.bringToFront();
  await expect.poll(() => isRooActionEnabledForPage(roo, page)).toBe(false);

  const result = await triggerRooActionForPage(roo, page);
  expect(result.popupAppeared).toBe(false);

  if (result.status === 'protocol-rejected') {
    expect(result.message.trim().length).toBeGreaterThan(0);
  }

  await expect.poll(() => isRooActionEnabledForPage(roo, page)).toBe(false);
}

async function routeFixture(page: Page, body = '<!doctype html><title>Roo Fixture</title>') {
  await page.route('**/*', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body,
  }));
}

async function openFixturePage(
  extension: RooExtension,
  url: string,
  snapshot?: { login: string; current: string },
): Promise<Page> {
  const page = await openRooTestTab(extension);
  await routeFixture(
    page,
    snapshot === undefined
      ? '<!doctype html><title>Roo Fixture</title>'
      : `<!doctype html><title>Roo AWS Fixture</title>
        <div id="awsc-login-display-name-account">${snapshot.login}</div>
        <div id="awsc-role-display-name-account">${snapshot.current}</div>`,
  );

  if (snapshot !== undefined) {
    await page.addInitScript(({ login, current }) => {
      const pageGlobal = globalThis as typeof globalThis & {
        ConsoleNavService?: {
          AccountInfo: {
            loginDisplayNameAccount: string;
            roleDisplayNameAccount: string;
          };
        };
      };

      pageGlobal.ConsoleNavService = {
        AccountInfo: {
          loginDisplayNameAccount: login,
          roleDisplayNameAccount: current,
        },
      };
    }, snapshot);
  }

  await page.goto(url);
  await page.bringToFront();
  return page;
}

async function queryActiveContext(roo: RooExtension, activePage: Page): Promise<AwsTabContextResponse> {
  await activePage.bringToFront();
  const queryPage = await roo.context.newPage();

  try {
    await queryPage.goto(`${roo.extensionUrl}/options.html`);
    await activePage.bringToFront();
    const response = await queryPage.evaluate(async () => {
      const extensionGlobal = globalThis as typeof globalThis & {
        chrome: {
          runtime: {
            sendMessage: (message: unknown) => Promise<unknown>;
          };
        };
      };

      return extensionGlobal.chrome.runtime.sendMessage({ type: 'GET_ACTIVE_AWS_TAB_CONTEXT' });
    });
    const parsed = parseAwsTabContextResponse(response);

    if (parsed === undefined) {
      throw new Error('The extension returned an invalid AWS tab-context response.');
    }

    return parsed;
  } finally {
    await queryPage.close();
  }
}

async function waitForReady(roo: RooExtension, activePage: Page) {
  let latest: AwsTabContextResponse | undefined;

  await expect.poll(async () => {
    latest = await queryActiveContext(roo, activePage);
    return latest.ok && latest.probe.result.status === 'ready';
  }).toBe(true);

  if (
    latest === undefined ||
    !latest.ok ||
    latest.probe.result.status !== 'ready' ||
    latest.probe.tabId === null
  ) {
    throw new Error('The active AWS tab did not have ready context.');
  }

  return latest;
}

function organizationCatalogSeed() {
  return {
    'roo-configuration-v1': {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'uploaded', fileName: 'organizations.json' },
      config: {
        version: 2,
        organizations: {
          engineering: {
            baseAccounts: [{ accountId: '111111111111' }],
            defaults: { enabled: false, roles: [] },
            projects: {
              atlas: {
                accounts: { prod: '111111111113' },
                roles: { 'platform/read-only': {} },
              },
            },
          },
        },
      },
    },
  };
}

test('exact supported commercial AWS hosts enable Roo', async ({ roo }) => {
  const page = await openRooTestTab(roo);
  await routeFixture(page);

  for (const url of supportedUrls) {
    await page.goto(url);
    await expect.poll(() => isRooActionEnabledForPage(roo, page)).toBe(true);
  }
});

test('unsupported hosts disable Roo', async ({ roo }) => {
  const page = await openRooTestTab(roo);
  await routeFixture(page);

  for (const url of unsupportedUrls) {
    await page.goto(url);
    await expectRooActionDisabled(roo, page);
  }
});

test('Roo action state is tab-scoped', async ({ roo }) => {
  const supportedPage = await openFixturePage(roo, supportedUrls[1] as string);
  const unsupportedPage = await openFixturePage(roo, unsupportedUrls[0] as string);

  await expect.poll(() => isRooActionEnabledForPage(roo, supportedPage)).toBe(true);
  await expect.poll(() => isRooActionEnabledForPage(roo, unsupportedPage)).toBe(false);
  await expect.poll(() => isRooActionEnabledForPage(roo, supportedPage)).toBe(true);
});

test('navigation updates Roo action state', async ({ roo }) => {
  const page = await openRooTestTab(roo);
  await routeFixture(page);

  await page.goto(supportedUrls[1] as string);
  await expect.poll(() => isRooActionEnabledForPage(roo, page)).toBe(true);

  await page.goto(unsupportedUrls[0] as string);
  await expect.poll(() => isRooActionEnabledForPage(roo, page)).toBe(false);

  await page.goto(supportedUrls[1] as string);
  await expect.poll(() => isRooActionEnabledForPage(roo, page)).toBe(true);
});

test('the real toolbar action follows supported navigation lifecycle', async ({ roo }) => {
  const page = await openRooTestTab(roo);
  await routeFixture(page);

  await page.goto(supportedUrls[1] as string);
  await expect.poll(() => isRooActionEnabledForPage(roo, page)).toBe(true);
  const firstPopup = await openRooActionPopupForPage(roo, page);
  await firstPopup.close();

  await page.goto(unsupportedUrls[0] as string);
  await expectRooActionDisabled(roo, page);

  await page.goto(supportedUrls[1] as string);
  await expect.poll(() => isRooActionEnabledForPage(roo, page)).toBe(true);
  const secondPopup = await openRooActionPopupForPage(roo, page);
  await expect(secondPopup.getByLabel('Search AWS destinations')).toBeVisible();
  await secondPopup.close();
});

test('supported AWS navigation opens Roo on the first toolbar trigger', async ({ roo }) => {
  const page = await openRooTestTab(roo);
  await routeFixture(
    page,
    `<!doctype html><title>Roo AWS Fixture</title>
      <div id="awsc-login-display-name-account">111111111111</div>
      <div id="awsc-role-display-name-account">111111111113</div>`,
  );
  await page.addInitScript(() => {
    const pageGlobal = globalThis as typeof globalThis & {
      ConsoleNavService?: {
        AccountInfo: {
          loginDisplayNameAccount: string;
          roleDisplayNameAccount: string;
        };
      };
    };
    pageGlobal.ConsoleNavService = {
      AccountInfo: {
        loginDisplayNameAccount: '111111111111',
        roleDisplayNameAccount: '111111111113',
      },
    };
  });

  await page.goto(supportedUrls[1] as string, { waitUntil: 'commit' });
  const firstTrigger = await triggerRooActionForPage(roo, page, { timeoutMs: 10_000 });

  expect(firstTrigger).toEqual({ status: 'triggered', popupAppeared: true });
  const firstPopup = await attachRooActionPopupForPage(roo, page);
  await expect(firstPopup.getByLabel('Search AWS destinations')).toBeVisible();
  await firstPopup.close();

  await waitForReady(roo, page);
  const establishedPopup = await openRooActionPopupForPage(roo, page);
  await expect(establishedPopup.getByLabel('Search AWS destinations')).toBeVisible();
  await establishedPopup.close();
});

test('the Popup consumes last-ready context after page fields are removed', async ({ roo }) => {
  await roo.seedStorage(organizationCatalogSeed());
  const page = await openFixturePage(
    roo,
    supportedUrls[1] as string,
    { login: '111111111111', current: '111111111113' },
  );

  const established = await waitForReady(roo, page);
  expect(established.probe.tabId).toBeGreaterThan(0);

  await page.evaluate(() => {
    const pageGlobal = globalThis as typeof globalThis & {
      ConsoleNavService?: unknown;
    };
    delete pageGlobal.ConsoleNavService;
    document.querySelector('#awsc-login-display-name-account')?.remove();
    document.querySelector('#awsc-role-display-name-account')?.remove();
    window.dispatchEvent(new Event('focus'));
  });

  const popup = await openRooActionPopupForPage(roo, page);
  const search = popup.getByLabel('Search AWS destinations');
  await expect(search).toBeFocused();
  await expect(popup.getByText('1 accounts · 1 roles')).toBeVisible();

  await search.fill('111111111113');
  await expect(popup.locator('.result-row')).toHaveCount(1);
  await expect(popup.locator('.result-role')).toHaveText('read-only');
});
