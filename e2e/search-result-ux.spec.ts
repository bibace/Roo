import { test as base, expect } from '@playwright/test';
import {
  closeRooExtension,
  launchRooExtension,
  openPopup,
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
