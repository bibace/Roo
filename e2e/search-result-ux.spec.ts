import { test as base, expect } from '@playwright/test';
import { searchJumpTargets } from '../src/search/search-jump-targets';
import {
  closeRooExtension,
  createSearchScaleCatalogSeed,
  expectLegacySwitchRolePost,
  launchRooExtension,
  openRooActionPopupForPage,
  openPopup,
  openRooTestTab,
  SEARCH_SCALE_TARGET_COUNT,
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

const project = 'operations-platform-services-workspace-navigation';
const accountIds = {
  prod: '111111111111',
  production: '222222222222',
  nonprod: '333333333333',
  preprod: '444444444444',
  myprod: '555555555555',
} as const;

function accountName(environment: keyof typeof accountIds): string {
  return project + '-' + environment;
}

function catalogSeed() {
  return {
    'roo-configuration-v1': {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'uploaded', fileName: 'search-result-ux.json' },
      config: {
        version: 1,
        defaults: { enabled: false },
        projects: {
          [project]: {
            accounts: accountIds,
            roles: {
              'platform/security-readonly': {},
            },
          },
        },
      },
    },
  };
}

async function openSupportedAwsConsolePage(extension: RooExtension) {
  const page = await openRooTestTab(extension);
  await page.route('**/*', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><meta name="awsc-session-data" content=\'{"prismModeEnabled":false,"signInEndpoint":"signin.aws.amazon.com"}\'><title>AWS Console Fixture</title>',
  }));
  await page.addInitScript(() => {
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
    pageGlobal.AWSC = {
      Auth: {
        getMbtc: () => 1234567890,
      },
    };
  });
  await page.goto('https://us-east-1.console.aws.amazon.com/console/home');
  await page.bringToFront();
  return page;
}

async function expectRenderedRowsFollowSearchOrder(
  popup: Awaited<ReturnType<typeof openPopup>>,
  expectedAccountNames: readonly string[],
) {
  const renderedAccountNames = await popup.locator('.result-row .result-account-name').allTextContents();
  expect(renderedAccountNames.length).toBeGreaterThan(0);
  const firstExpectedIndex = expectedAccountNames.indexOf(renderedAccountNames[0] as string);
  expect(firstExpectedIndex).toBeGreaterThanOrEqual(0);
  expect(renderedAccountNames).toEqual(
    expectedAccountNames.slice(firstExpectedIndex, firstExpectedIndex + renderedAccountNames.length),
  );
}

test('Popup search returns exact and prefix environments without internal substrings', async ({ roo }) => {
  await roo.seedStorage(catalogSeed());
  const popup = await openPopup(roo);
  const search = popup.getByLabel('Search AWS destinations');
  const rows = popup.locator('.result-row');

  await search.fill('prod');

  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('.result-account-name')).toHaveText(accountName('prod'));
  await expect(rows.nth(1).locator('.result-account-name')).toHaveText(accountName('production'));
  await expect(rows.nth(0)).toHaveAttribute('data-active', 'true');
  const returnedAccountNames = await popup.locator('.result-account-name').allTextContents();
  for (const environment of ['nonprod', 'preprod', 'myprod'] as const) {
    expect(returnedAccountNames).not.toContain(accountName(environment));
  }
});

test('Popup pans only automatically or keyboard-selected overflowing account names', async ({ roo }) => {
  await roo.seedStorage(catalogSeed());
  const popup = await openPopup(roo);
  const search = popup.getByLabel('Search AWS destinations');
  const rows = popup.locator('.result-row');

  await search.fill('prod');

  const firstName = rows.nth(0).locator('.result-account-name');
  await expect(firstName).toHaveAttribute('title', accountName('prod'));
  await expect(firstName).toHaveAttribute('data-overflowing', 'true');
  await expect(firstName).toHaveAttribute('data-scrolling', 'true');
  await expect(firstName.locator('.result-account-name-text')).toHaveCSS(
    'animation-name',
    'roo-account-name-pan',
  );
  const geometry = await firstName.evaluate((viewport) => {
    const text = viewport.querySelector<HTMLElement>('.result-account-name-text');

    if (!text) {
      throw new Error('The account-name text element was not rendered.');
    }

    return {
      innerScrollWidth: text.scrollWidth,
      outerClientWidth: viewport.clientWidth,
    };
  });
  expect(geometry.innerScrollWidth).toBeGreaterThan(geometry.outerClientWidth);

  const secondRow = rows.nth(1);
  const secondName = secondRow.locator('.result-account-name');
  await secondRow.hover();
  await expect(secondRow).toHaveAttribute('data-active', 'true');
  await expect(secondName).toHaveAttribute('title', accountName('production'));
  await expect(secondName).toHaveAttribute('data-overflowing', 'true');
  await expect(secondName).toHaveAttribute('data-scrolling', 'false');
  await expect(secondName.locator('.result-account-name-text')).toHaveCSS('animation-name', 'none');

  await search.press('ArrowUp');
  await expect(rows.nth(0)).toHaveAttribute('data-active', 'true');
  await expect(firstName).toHaveAttribute('data-scrolling', 'true');
});

test('Popup virtualizes and navigates a 1,000-result search in pure-search order', async ({ roo }) => {
  const scaleCatalog = createSearchScaleCatalogSeed();
  const expectedTargets = searchJumpTargets(scaleCatalog.targets, 'sca');
  const expectedAccountNames = expectedTargets.map((target) => target.accountName);
  expect(scaleCatalog.targets).toHaveLength(SEARCH_SCALE_TARGET_COUNT);
  expect(expectedTargets).toHaveLength(SEARCH_SCALE_TARGET_COUNT);

  await roo.seedStorage(scaleCatalog.storage);
  const awsPage = await openSupportedAwsConsolePage(roo);
  const popup = await openRooActionPopupForPage(roo, awsPage);
  const search = popup.getByLabel('Search AWS destinations');
  const resultRegion = popup.locator('.result-region');
  const rows = popup.locator('.result-row');

  await search.fill('sca');
  await expect(search).toBeFocused();
  await expect.poll(() => rows.count()).toBeLessThanOrEqual(24);
  expect(await rows.count()).toBeLessThan(SEARCH_SCALE_TARGET_COUNT);
  await expect(rows.first().locator('.result-account-name')).toHaveText(expectedAccountNames[0] as string);
  await expectRenderedRowsFollowSearchOrder(popup, expectedAccountNames);

  const totalScrollHeight = await resultRegion.evaluate((element) => element.scrollHeight);
  expect(totalScrollHeight).toBe(SEARCH_SCALE_TARGET_COUNT * 34);

  const sampledScrollTops = [0, Math.floor(totalScrollHeight / 2), totalScrollHeight];

  for (const scrollTop of sampledScrollTops) {
    await resultRegion.evaluate((element, nextScrollTop) => {
      element.scrollTop = nextScrollTop;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    }, scrollTop);
    await expect.poll(() => rows.count()).toBeLessThanOrEqual(24);
    await expectRenderedRowsFollowSearchOrder(popup, expectedAccountNames);
  }

  await expect(rows.last().locator('.result-account-name')).toHaveText(
    expectedAccountNames[expectedAccountNames.length - 1] as string,
  );

  await search.fill('sca');
  for (let index = 0; index < 32; index += 1) {
    await search.press('ArrowDown');
  }

  const activeRows = popup.locator('.result-row[data-active="true"]');
  const activeRow = activeRows.first();
  await expect(activeRows).toHaveCount(1);
  await expect(activeRow.locator('.result-account-name')).toHaveText(
    expectedAccountNames[32] as string,
  );
  expect(await rows.count()).toBeLessThanOrEqual(24);
  expect(await activeRow.evaluate((row) => {
    const region = row.closest('.result-region');
    if (!region) {
      return false;
    }
    const rowBounds = row.getBoundingClientRect();
    const regionBounds = region.getBoundingClientRect();
    return rowBounds.top >= regionBounds.top && rowBounds.bottom <= regionBounds.bottom;
  })).toBe(true);

  const expectedTarget = expectedTargets[32];
  if (!expectedTarget) {
    throw new Error('The generated search-scale target was not found.');
  }
  const switchExpectation = expectLegacySwitchRolePost(
    roo,
    awsPage.url(),
    {
      account: expectedTarget.accountId,
      roleName: expectedTarget.role,
      displayName: `${expectedTarget.accountName} | ${expectedTarget.accountId}`,
    },
  );
  await switchExpectation.ready;
  await search.press('Enter');
  await switchExpectation.done;
  await expect.poll(() => popup.isClosed()).toBe(true);
});
