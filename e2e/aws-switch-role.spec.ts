import { test as base, expect, type Page } from '@playwright/test';
import {
  closeRooExtension,
  expectLegacySwitchRolePost,
  expectPrismSwitchRoleRequest,
  launchRooExtension,
  openRooTestTab,
  openRooActionPopupForPage,
  type RooExtension,
} from './fixtures';

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

const target = {
  account: '111111111111',
  roleName: 'platform/security-readonly',
  displayName: 'atlas-prod | 111111111111',
};

const prismOriginatingUrl =
  'https://000000000000-aaaaaaaa.us-east-1.console.aws.amazon.com/console/home?region=us-east-1';
const prismRedirectUri =
  'https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1';
const prismDestinationUrl =
  'https://999999999999-bbbbbbbb.us-east-1.console.aws.amazon.com/console/home?region=us-east-1';
const prismRequestUrl =
  'https://signin.aws.amazon.com/sessions/000000000000-aaaaaaaa/v1/switchrole';

function catalogSeed() {
  return {
    'roo-configuration-v1': {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'uploaded', fileName: 'seed.json' },
      config: {
        version: 1,
        defaults: { enabled: false },
        projects: {
          atlas: {
            accounts: { prod: target.account },
            roles: { [target.roleName]: {} },
          },
        },
      },
    },
  };
}

async function openAwsConsoleFixture(
  extension: RooExtension,
  options: {
    mode: 'legacy' | 'prism';
    legacyCsrf?: boolean;
    sessionDifferentiator?: string;
  },
): Promise<Page> {
  const page = await openRooTestTab(extension);
  const sessionData = options.mode === 'prism'
    ? {
        prismModeEnabled: true,
        signInEndpoint: 'signin.aws.amazon.com',
        ...(options.sessionDifferentiator === undefined
          ? {}
          : { sessionDifferentiator: options.sessionDifferentiator }),
      }
    : {
        prismModeEnabled: false,
        signInEndpoint: 'signin.aws.amazon.com',
      };

  await page.route('**/*', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><meta name="awsc-session-data" content='${JSON.stringify(sessionData)}'><title>AWS Console Fixture</title><main>AWS Console Fixture</main>`,
  }));
  await page.addInitScript(({ mode, legacyCsrf }) => {
    const pageGlobal = globalThis as typeof globalThis & {
      ConsoleNavService?: { AccountInfo: Record<string, string | null> };
      AWSC?: { Auth: { getMbtc: () => string | number } };
    };
    pageGlobal.ConsoleNavService = {
      AccountInfo: {
        loginDisplayNameAccount: null,
        roleDisplayNameAccount: null,
      },
    };
    if (mode === 'legacy' && legacyCsrf) {
      pageGlobal.AWSC = {
        Auth: {
          getMbtc: () => 1234567890,
        },
      };
    }
  }, { mode: options.mode, legacyCsrf: options.legacyCsrf ?? true });
  await page.goto(options.mode === 'prism'
    ? prismOriginatingUrl
    : 'https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1');
  await page.bringToFront();
  return page;
}

async function expectNoRequest(
  extension: RooExtension,
  predicate: (request: { method: () => string; url: () => string }) => boolean,
): Promise<void> {
  const requestPromise = extension.context.waitForEvent('request', {
    predicate,
    timeout: 1_500,
  });

  await expect(requestPromise).rejects.toThrow();
}

test('legacy AWS Console switch completes without activation error', async ({ roo }) => {
  await roo.seedStorage(catalogSeed());
  const awsPage = await openAwsConsoleFixture(roo, { mode: 'legacy' });
  expect(await awsPage.evaluate(() => {
    const sessionElement = document.querySelector('meta[name="awsc-session-data"]');
    const session = JSON.parse(sessionElement?.getAttribute('content') ?? '{}') as {
      prismModeEnabled?: unknown;
    };
    const pageGlobal = globalThis as typeof globalThis & {
      AWSC?: { Auth?: { getMbtc?: () => unknown } };
    };
    const getMbtc = pageGlobal.AWSC?.Auth?.getMbtc;
    return {
      prismModeEnabled: session.prismModeEnabled,
      getMbtcExists: typeof getMbtc === 'function',
      getMbtcType: typeof getMbtc === 'function' ? typeof getMbtc() : 'undefined',
    };
  })).toEqual({
    prismModeEnabled: false,
    getMbtcExists: true,
    getMbtcType: 'number',
  });
  const popup = await openRooActionPopupForPage(roo, awsPage);
  const search = popup.getByLabel('Search AWS destinations');
  await search.fill('atlas');
  await expect(popup.locator('.result-row')).toHaveCount(1);
  await expect(popup.getByText('Unable to open AWS destination.')).not.toBeVisible();

  const expectation = expectLegacySwitchRolePost(roo, awsPage.url(), target);
  await expectation.ready;
  await popup.bringToFront();
  await search.press('Enter');
  await expectation.done;
  await expect.poll(() => popup.isClosed()).toBe(true);
  await roo.assertNoRuntimeErrors();
  await awsPage.close();
});

test('Prism removes the current session prefix from redirectUri before switching', async ({ roo }) => {
  await roo.seedStorage(catalogSeed());
  const awsPage = await openAwsConsoleFixture(roo, {
    mode: 'prism',
    sessionDifferentiator: '000000000000-aaaaaaaa',
  });
  expect(await awsPage.evaluate(() => {
    const pageGlobal = globalThis as typeof globalThis & {
      AWSC?: { Auth?: { getMbtc?: unknown } };
    };
    return typeof pageGlobal.AWSC?.Auth?.getMbtc === 'function';
  })).toBe(false);

  const popup = await openRooActionPopupForPage(roo, awsPage);
  const search = popup.getByLabel('Search AWS destinations');
  await search.fill('atlas');
  await expect(popup.locator('.result-row')).toHaveCount(1);

  const requestPromise = expectPrismSwitchRoleRequest(
    roo,
    awsPage.url(),
    prismRedirectUri,
    target,
  );
  await popup.bringToFront();
  await search.press('Enter');
  await requestPromise;
  await expect(awsPage).toHaveURL(
    prismDestinationUrl,
  );
  await expect.poll(() => popup.isClosed()).toBe(true);
  await roo.assertNoRuntimeErrors();
  await awsPage.close();
});

test('legacy AWS Console without CSRF capability fails visibly', async ({ roo }) => {
  await roo.seedStorage(catalogSeed());
  const awsPage = await openAwsConsoleFixture(roo, { mode: 'legacy', legacyCsrf: false });
  const popup = await openRooActionPopupForPage(roo, awsPage);
  const search = popup.getByLabel('Search AWS destinations');
  await search.fill('atlas');

  const noRequestPromise = expectNoRequest(roo, (request) => {
    const url = new URL(request.url());
    return request.method() === 'POST' && url.hostname === 'signin.aws.amazon.com' && url.pathname === '/switchrole';
  });
  await popup.bringToFront();
  await search.press('Enter');
  await noRequestPromise;
  await expect(popup.getByText('Unable to open AWS destination.')).toBeVisible();
  await expect(popup.getByText('Diagnostic: LEGACY_CSRF_UNAVAILABLE')).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(false);
  await roo.assertNoRuntimeErrors();
  await popup.close();
  await awsPage.close();
});

test('Prism AWS Console without sessionDifferentiator fails visibly', async ({ roo }) => {
  await roo.seedStorage(catalogSeed());
  const awsPage = await openAwsConsoleFixture(roo, { mode: 'prism' });
  const popup = await openRooActionPopupForPage(roo, awsPage);
  const search = popup.getByLabel('Search AWS destinations');
  await search.fill('atlas');

  const noRequestPromise = expectNoRequest(roo, (request) =>
    request.method() === 'POST' && request.url().includes('/sessions/'),
  );
  await popup.bringToFront();
  await search.press('Enter');
  await noRequestPromise;
  await expect(popup.getByText('Unable to open AWS destination.')).toBeVisible();
  await expect(popup.getByText('Diagnostic: PRISM_SESSION_MISSING')).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(false);
  await roo.assertNoRuntimeErrors();
  await popup.close();
  await awsPage.close();
});

test('Prism HTTP failure exposes PRISM_HTTP_FAILED', async ({ roo }) => {
  await roo.seedStorage(catalogSeed());
  const awsPage = await openAwsConsoleFixture(roo, {
    mode: 'prism',
    sessionDifferentiator: '000000000000-aaaaaaaa',
  });
  await awsPage.route(prismRequestUrl, (route) => route.fulfill({ status: 500 }));

  const popup = await openRooActionPopupForPage(roo, awsPage);
  const search = popup.getByLabel('Search AWS destinations');
  await search.fill('atlas');
  await popup.bringToFront();
  await search.press('Enter');

  await expect(popup.getByText('Unable to open AWS destination.')).toBeVisible();
  await expect(popup.getByText('Diagnostic: PRISM_HTTP_FAILED')).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(false);
  await expect(popup.locator('body')).not.toContainText('000000000000-aaaaaaaa');
  await popup.close();
  await awsPage.close();
});

test('Prism malformed response exposes PRISM_RESPONSE_INVALID', async ({ roo }) => {
  await roo.seedStorage(catalogSeed());
  const awsPage = await openAwsConsoleFixture(roo, {
    mode: 'prism',
    sessionDifferentiator: '000000000000-aaaaaaaa',
  });
  await awsPage.route(prismRequestUrl, (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: '{malformed-json',
  }));

  const popup = await openRooActionPopupForPage(roo, awsPage);
  const search = popup.getByLabel('Search AWS destinations');
  await search.fill('atlas');
  await popup.bringToFront();
  await search.press('Enter');

  await expect(popup.getByText('Unable to open AWS destination.')).toBeVisible();
  await expect(popup.getByText('Diagnostic: PRISM_RESPONSE_INVALID')).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(false);
  await popup.close();
  await awsPage.close();
});
