import { test as base, expect, type Page } from '@playwright/test';
import {
  closeRooExtension,
  expectLegacySwitchRolePost,
  launchRooExtension,
  openOptions,
  openPopup,
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

async function chooseConfigurationFile(page: Page, name: string, source: string) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload YAML / JSON' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(source) });
}

async function replaceEditorSource(page: Page, source: string) {
  const editor = page.locator('.configuration-editor .cm-content');
  await editor.fill(source);
  await expect.poll(async () => (await editor.innerText()).trimEnd()).toBe(source.trimEnd());
}

async function openSupportedAwsConsolePage(extension: RooExtension): Promise<Page> {
  const page = await openRooTestTab(extension);
  await page.route('**/*', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><meta name="awsc-session-data" content=\'{"prismModeEnabled":false,"signInEndpoint":"signin.aws.amazon.com"}\'><title>AWS Console Fixture</title><main>AWS Console Fixture</main>',
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

test('stale Configuration save preserves the draft until the latest state is reviewed', async ({ roo }) => {
  const firstPage = await openOptions(roo);
  const secondPage = await openOptions(roo);
  const firstConfiguration = JSON.stringify({
    version: 1,
    defaults: { enabled: false },
    projects: { atlas: { accounts: { prod: '111111111111' } } },
  });
  const secondConfiguration = JSON.stringify({
    version: 1,
    defaults: { enabled: false },
    projects: { nova: { accounts: { prod: '222222222222' } } },
  });

  await chooseConfigurationFile(firstPage, 'first.json', firstConfiguration);
  await expect(firstPage.getByText('first.yaml')).toBeVisible();
  await chooseConfigurationFile(secondPage, 'second.json', secondConfiguration);
  await secondPage.getByRole('button', { name: 'Save configuration' }).click();
  await expect(secondPage.getByText('Configuration saved.')).toBeVisible();

  const originalDraft = await firstPage.locator('.cm-content').innerText();
  await firstPage.getByRole('button', { name: 'Save configuration' }).click();
  await expect(firstPage.getByText(
    'Configuration changed in another Roo window. Review and try again.',
  )).toBeVisible();
  await expect(firstPage.getByText('first.yaml')).toBeVisible();
  await expect.poll(() => firstPage.locator('.cm-content').innerText()).toBe(originalDraft);
  await expect(firstPage.getByRole('button', { name: 'Save configuration' })).toBeDisabled();

  await firstPage.getByRole('button', { name: 'Review latest' }).click();
  await expect(firstPage.getByText('Configuration is valid.')).toBeVisible();
  await expect(firstPage.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
  await firstPage.getByRole('button', { name: 'Save configuration' }).click();
  await expect(firstPage.getByText('Configuration saved.')).toBeVisible();
  await expect(firstPage.getByText('first.json')).toBeVisible();
});

test('Configuration refresh does not corrupt an active draft', async ({ roo }) => {
  const firstPage = await openOptions(roo);
  const secondPage = await openOptions(roo);

  await firstPage.getByRole('button', { name: 'New configuration' }).click();
  await replaceEditorSource(firstPage, `version: 1
projects:
  draft:
    accounts:
      dev: "444444444444"
    roles:
      platform/draft: {}
`);

  await chooseConfigurationFile(secondPage, 'external.json', JSON.stringify({
    version: 1,
    projects: { external: { accounts: { dev: '555555555555' } } },
  }));
  await secondPage.getByRole('button', { name: 'Save configuration' }).click();
  await expect(secondPage.getByText('Configuration saved.')).toBeVisible();

  await expect.poll(() => firstPage.locator('.cm-content').innerText()).toContain('draft:');
  await expect(firstPage.locator('.cm-content')).toContainText('444444444444');
  await expect(firstPage.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
});

test('stale delete cannot remove a newer uploaded configuration', async ({ roo }) => {
  await roo.seedStorage(catalogSeed());
  const firstPage = await openOptions(roo);
  await firstPage.getByRole('button', { name: 'Delete', exact: true }).click();
  await firstPage.getByLabel('Confirmation uploaded filename').fill('seed.json');
  await expect(firstPage.getByRole('button', { name: 'Delete permanently' })).toBeEnabled();

  const secondPage = await openOptions(roo);
  await secondPage.getByRole('button', { name: 'Edit configuration' }).click();
  await replaceEditorSource(secondPage, `version: 1
projects:
  newer:
    accounts:
      prod: "999999999999"
    roles:
      platform/newer: {}
`);
  await expect(secondPage.getByText('Configuration is valid.')).toBeVisible();
  await secondPage.getByRole('button', { name: 'Save configuration' }).click();
  await expect(secondPage.getByText('Configuration saved.')).toBeVisible();

  await firstPage.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(firstPage.getByText(
    'Configuration changed in another Roo window. Close this confirmation and try Delete again from the latest configuration.',
  )).toBeVisible();
  await expect(firstPage.getByLabel('Confirmation uploaded filename')).toHaveValue('');
  await expect(firstPage.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();

  const storage = await roo.readStorage(['roo-configuration-v1']);
  expect(storage['roo-configuration-v1']).toMatchObject({
    catalogVersion: 2,
    source: { kind: 'uploaded', fileName: 'seed.json' },
    config: { projects: { newer: expect.anything() } },
  });
  const popup = await openPopup(roo);
  await popup.getByLabel('Search AWS destinations').fill('newer');
  await expect(popup.locator('.result-row')).toContainText('newer-prod');

  await firstPage.getByRole('button', { name: 'Cancel' }).click();
  await firstPage.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(firstPage.getByLabel('Confirmation uploaded filename')).toHaveValue('');
  await expect(firstPage.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  await firstPage.getByLabel('Confirmation uploaded filename').fill('seed.json');
  await expect(firstPage.getByRole('button', { name: 'Delete permanently' })).toBeEnabled();
});

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
            accounts: { prod: '111111111111', dev: '222222222222' },
            roles: { 'platform/security-readonly': {} },
          },
        },
      },
    },
  };
}

test('Popup Search, keyboard, mouse activation, and Settings use the actual extension', async ({ roo }) => {
  await roo.seedStorage(catalogSeed());

  const keyboardAwsPage = await openSupportedAwsConsolePage(roo);
  const popup = await openRooActionPopupForPage(roo, keyboardAwsPage);
  await expect(popup.getByText('2 accounts · 2 roles')).toBeVisible();
  const search = popup.getByLabel('Search AWS destinations');
  await search.fill('at');
  await expect(popup.locator('.result-row')).toHaveCount(0);
  await search.fill('atlas');
  await expect(popup.locator('.result-row')).toHaveCount(2);
  await expect(popup.locator('.result-row').first()).toHaveAttribute('data-active', 'true');
  await search.press('ArrowDown');
  await search.press('ArrowUp');

  const keyboardExpectation = expectLegacySwitchRolePost(
    roo,
    keyboardAwsPage.url(),
    {
      account: '222222222222',
      roleName: 'platform/security-readonly',
      displayName: 'atlas-dev | 222222222222',
    },
  );
  await keyboardExpectation.ready;
  await search.press('Enter');
  await keyboardExpectation.done;
  await expect.poll(() => popup.isClosed()).toBe(true);

  const mouseAwsPage = await openSupportedAwsConsolePage(roo);
  await keyboardAwsPage.close();
  const mousePopup = await openRooActionPopupForPage(roo, mouseAwsPage);
  await mousePopup.getByLabel('Search AWS destinations').fill('atlas');
  await mousePopup.locator('.result-row').last().hover();
  await expect(mousePopup.locator('.result-row').last()).toHaveAttribute('data-active', 'true');
  const mouseExpectation = expectLegacySwitchRolePost(
    roo,
    mouseAwsPage.url(),
    {
      account: '111111111111',
      roleName: 'platform/security-readonly',
      displayName: 'atlas-prod | 111111111111',
    },
  );
  await mouseExpectation.ready;
  await mousePopup.locator('.result-row').last().click();
  await mouseExpectation.done;
  await expect.poll(() => mousePopup.isClosed()).toBe(true);

  const settingsAwsPage = await openSupportedAwsConsolePage(roo);
  const settingsPopup = await openRooActionPopupForPage(roo, settingsAwsPage);
  const settingsPagePromise = roo.context.waitForEvent('page');
  await settingsPopup.getByRole('button', { name: 'Settings' }).click();
  const settingsPage = await settingsPagePromise;
  await expect(settingsPage.getByRole('heading', { name: 'Roo Settings' })).toBeVisible();
  await settingsPopup.close();
  await mouseAwsPage.close();
  await settingsAwsPage.close();
});

test('Options and Popup contain corrupted persisted data without a blank page', async ({ roo }) => {
  await roo.seedStorage({
    'roo-configuration-v1': { storageVersion: 1, catalogVersion: 0 },
  });

  const options = await openOptions(roo);
  await expect(options.getByText(
    'Stored configuration is invalid. Replace it with a valid YAML or JSON file.',
  )).toBeVisible();

  const popup = await openPopup(roo);
  await expect(popup.getByText('Configuration needs attention.')).toBeVisible();
});
