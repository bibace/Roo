import { test as base, expect, type Page } from '@playwright/test';
import {
  closeRooExtension,
  expectLegacySwitchRolePost,
  expectPrismSwitchRoleRequest,
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

const engineeringAccount = '111111111113';
const corporateAccount = '222222222223';
const prismOriginatingUrl =
  'https://000000000000-aaaaaaaa.us-east-1.console.aws.amazon.com/console/home?region=us-east-1';
const prismRedirectUri =
  'https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1';
const prismDestinationUrl =
  'https://999999999999-bbbbbbbb.us-east-1.console.aws.amazon.com/console/home?region=us-east-1';

const organizationConfig = {
  version: 2,
  organizations: {
    engineering: {
      baseAccounts: [
        { accountId: '111111111111', accountAlias: 'engineering-root' },
        { accountId: '111111111112', accountAlias: 'engineering-sso' },
      ],
      defaults: { enabled: true, roles: ['platform/engineering-default'] },
      projects: {
        atlas: {
          accounts: { prod: engineeringAccount },
          roles: { 'platform/engineering-readonly': {} },
        },
      },
    },
    corporate: {
      baseAccounts: [{ accountId: '222222222222', accountAlias: 'corporate-root' }],
      defaults: { enabled: true, roles: ['platform/corporate-default'] },
      projects: {
        atlas: {
          accounts: { prod: corporateAccount },
          roles: { 'platform/corporate-readonly': {} },
        },
      },
    },
  },
};

const rawOrganizationConfig = {
  version: 2,
  organizations: {
    engineering: {
      base_accounts: [
        {
          account_id: '111111111111',
          account_alias: 'engineering-root',
        },
        {
          account_id: '111111111112',
          account_alias: 'engineering-sso',
        },
      ],
      defaults: {
        roles: ['platform/engineering-default'],
      },
      projects: {
        atlas: {
          accounts: {
            prod: '111111111113',
          },
          roles: {
            'platform/engineering-readonly': {},
          },
        },
      },
    },
    corporate: {
      base_accounts: [
        {
          account_id: '222222222222',
          account_alias: 'corporate-root',
        },
      ],
      projects: {
        atlas: {
          accounts: {
            prod: '222222222223',
          },
          roles: {
            'platform/corporate-readonly': {},
          },
        },
      },
    },
  },
};

function organizationCatalogSeed() {
  return {
    'roo-configuration-v1': {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'uploaded', fileName: 'organizations.json' },
      config: organizationConfig,
    },
  };
}

async function chooseConfigurationFile(page: Page, name: string, source: unknown) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload YAML / JSON' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(source)),
  });
}

async function openSyntheticAwsPage(
  extension: RooExtension,
  snapshot: { login: string | null; current: string | null },
  mode: 'legacy' | 'prism' = 'legacy',
  url?: string,
): Promise<Page> {
  const page = await openRooTestTab(extension);
  const effectiveUrl = url ?? (mode === 'prism'
    ? prismOriginatingUrl
    : 'https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1');
  const sessionData = JSON.stringify(
    mode === 'prism'
      ? {
          prismModeEnabled: true,
          signInEndpoint: 'signin.aws.amazon.com',
          sessionDifferentiator: '000000000000-aaaaaaaa',
        }
      : {
          prismModeEnabled: false,
          signInEndpoint: 'signin.aws.amazon.com',
        },
  );
  await page.route('**/*', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><meta name="awsc-session-data" content='${sessionData}'><title>AWS Console Fixture</title><main>AWS Console Fixture</main>`,
  }));

  if (effectiveUrl.includes('console.aws.amazon.com')) {
    await page.addInitScript(({ login, current, pageMode }) => {
      const pageGlobal = globalThis as typeof globalThis & {
        ConsoleNavService?: { AccountInfo: Record<string, string | null> };
        AWSC?: { Auth: { getMbtc: () => string | number } };
      };
      pageGlobal.ConsoleNavService = {
        AccountInfo: {
          loginDisplayNameAccount: login,
          roleDisplayNameAccount: current,
        },
      };
      if (pageMode === 'legacy') {
        pageGlobal.AWSC = {
          Auth: {
            getMbtc: () => 1234567890,
          },
        };
      }
    }, { ...snapshot, pageMode: mode });
  }

  await page.goto(effectiveUrl);
  await page.bringToFront();
  return page;
}

async function expectPopupAccount(
  popup: Page,
  accountId: string,
  resultCount: number,
  summary: string,
) {
  await expect(popup.getByText(summary)).toBeVisible();
  await popup.getByLabel('Search AWS destinations').fill(accountId);
  await expect(popup.locator('.result-row')).toHaveCount(resultCount);
  await expect(popup.locator('.result-account-id')).toHaveText(
    Array.from({ length: resultCount }, () => accountId),
  );
}

test('v2 Simple import keeps Popup independent from AWS context', async ({ roo }) => {
  const options = await openOptions(roo);
  await chooseConfigurationFile(options, 'simple.json', {
    version: 2,
    projects: {
      atlas: {
        accounts: { prod: '111111111111' },
        roles: { 'platform/read-only': {} },
      },
    },
  });
  await options.getByRole('button', { name: 'Save configuration' }).click();
  await expect(options.getByText('Configuration saved.')).toBeVisible();

  const popup = await openPopup(roo);
  await expect(popup.getByText('1 accounts · 1 roles')).toBeVisible();
  await popup.getByLabel('Search AWS destinations').fill('111111111111');
  await expect(popup.locator('.result-account-id')).toHaveText('111111111111');
});

test('Org catalog imports through Settings and drives the real action Popup', async ({ roo }) => {
  const options = await openOptions(roo);
  await chooseConfigurationFile(options, 'organizations.json', rawOrganizationConfig);
  await expect(options.locator('.candidate-preview')).toBeVisible();
  await expect(options.getByText('organizations.yaml')).toBeVisible();

  await options.getByRole('button', { name: 'Save configuration' }).click();
  await expect(options.getByText('Configuration saved.')).toBeVisible();

  let persisted: {
    storageVersion: number;
    catalogVersion: number;
    source: { kind: string; fileName?: string };
    config: Record<string, unknown>;
  } | undefined;
  await expect.poll(async () => {
    persisted = (await roo.readStorage(['roo-configuration-v1']))['roo-configuration-v1'] as typeof persisted;
    return persisted;
  }).toMatchObject({
    storageVersion: 1,
    catalogVersion: 1,
    source: { kind: 'uploaded', fileName: 'organizations.json' },
  });
  if (persisted === undefined) {
    throw new Error('The imported Roo catalog was not persisted.');
  }
  expect(persisted.config.version).toBe(2);
  expect(persisted.config).toHaveProperty('organizations');
  expect(persisted.config).not.toHaveProperty('organisations');
  expect(persisted).not.toHaveProperty('sourceText');
  expect(persisted).not.toHaveProperty('targets');
  expect(persisted).not.toHaveProperty('scopes');
  expect(persisted.config).not.toHaveProperty('sourceText');
  expect(persisted.config).not.toHaveProperty('targets');
  expect(persisted.config).not.toHaveProperty('scopes');
  const persistedOrganizations = persisted.config.organizations as Record<string, Record<string, unknown>>;
  const persistedEngineering = persistedOrganizations.engineering;
  expect(persistedEngineering).toHaveProperty('baseAccounts');
  expect(persistedEngineering).not.toHaveProperty('base_accounts');
  expect(JSON.stringify(persisted)).not.toContain('base_accounts');

  await options.close();
  const reopenedOptions = await openOptions(roo);
  await expect(reopenedOptions.getByText('organizations.json')).toBeVisible();
  await reopenedOptions.close();

  const awsPage = await openSyntheticAwsPage(roo, {
    login: 'engineering-root',
    current: null,
  });
  const popup = await openRooActionPopupForPage(roo, awsPage);
  await expect(popup.getByText('1 accounts · 2 roles')).toBeVisible();

  const search = popup.getByLabel('Search AWS destinations');
  await search.fill('engineering');
  await expect(popup.locator('.result-row')).toHaveCount(2);
  await expect(popup.locator('.result-account-id')).toHaveText([engineeringAccount, engineeringAccount]);

  await search.fill(corporateAccount);
  await expect(popup.locator('.result-row')).toHaveCount(0);

  await search.fill(engineeringAccount);
  await expect(popup.locator('.result-row')).toHaveCount(2);
  await expect(popup.locator('.result-account-id')).toHaveText([engineeringAccount, engineeringAccount]);
  await expect(popup.locator('.result-role')).toHaveText([
    'engineering-default',
    'engineering-readonly',
  ]);

  await search.fill('engineering-default');
  await expect(popup.locator('.result-row')).toHaveCount(1);
  const engineeringExpectation = expectLegacySwitchRolePost(
    roo,
    awsPage.url(),
    {
      account: engineeringAccount,
      roleName: 'platform/engineering-default',
      displayName: `atlas-prod | ${engineeringAccount}`,
    },
  );
  await engineeringExpectation.ready;
  await search.press('Enter');
  await engineeringExpectation.done;
  await expect.poll(() => popup.isClosed()).toBe(true);

  await roo.assertNoRuntimeErrors();
  await awsPage.close();
});

test('Org Mode resolves the current organization and switches through Prism', async ({ roo }) => {
  await roo.seedStorage(organizationCatalogSeed());

  const awsPage = await openSyntheticAwsPage(
    roo,
    { login: 'engineering-root', current: null },
    'prism',
  );
  const popup = await openRooActionPopupForPage(roo, awsPage);
  await expect(popup.getByText('1 accounts · 2 roles')).toBeVisible();

  const search = popup.getByLabel('Search AWS destinations');
  await search.fill('corporate');
  await expect(popup.locator('.result-row')).toHaveCount(0);
  await search.fill('engineering-readonly');
  await expect(popup.locator('.result-row')).toHaveCount(1);
  await expect(popup.locator('.result-account-id')).toHaveText(engineeringAccount);
  await expect(popup.locator('.result-role')).toHaveText('engineering-readonly');
  await expect(popup.locator('.result-row')).not.toContainText('corporate');

  const prismRequestPromise = expectPrismSwitchRoleRequest(
    roo,
    awsPage.url(),
    prismRedirectUri,
    {
      account: engineeringAccount,
      roleName: 'platform/engineering-readonly',
      displayName: `atlas-prod | ${engineeringAccount}`,
    },
  );
  await search.press('Enter');
  await prismRequestPromise;
  await expect(awsPage).toHaveURL(
    prismDestinationUrl,
  );
  await expect.poll(() => popup.isClosed()).toBe(true);
  await roo.assertNoRuntimeErrors();
  await awsPage.close();
});

test('Org action Popup treats every base identity as the same organization scope', async ({ roo }) => {
  await roo.seedStorage(organizationCatalogSeed());

  const cases = [
    { login: '111111111111', current: null },
    { login: 'engineering-root', current: null },
    { login: '111111111112', current: null },
    { login: 'engineering-sso', current: null },
  ];

  for (const testCase of cases) {
    const awsPage = await openSyntheticAwsPage(roo, {
      login: testCase.login,
      current: testCase.current,
    });
    const popup = await openRooActionPopupForPage(roo, awsPage);
    await expect(popup.getByText('1 accounts · 2 roles')).toBeVisible();
    const search = popup.getByLabel('Search AWS destinations');
    await search.fill(engineeringAccount);
    await expect(popup.locator('.result-row')).toHaveCount(2);
    await expect(popup.locator('.result-account-id')).toHaveText([engineeringAccount, engineeringAccount]);
    await expect(popup.locator('.result-role')).toHaveText([
      'engineering-default',
      'engineering-readonly',
    ]);
    await search.fill(corporateAccount);
    await expect(popup.locator('.result-row')).toHaveCount(0);
    await popup.close();
    await awsPage.close();
  }
});

test('Org base accounts identify the organization without becoming destinations', async ({ roo }) => {
  await roo.seedStorage(organizationCatalogSeed());

  const awsPage = await openSyntheticAwsPage(roo, {
    login: 'engineering-sso',
    current: null,
  });
  const popup = await openRooActionPopupForPage(roo, awsPage);
  await expect(popup.getByText('1 accounts · 2 roles')).toBeVisible();

  const search = popup.getByLabel('Search AWS destinations');
  for (const baseIdentity of [
    '111111111111',
    'engineering-root',
    '111111111112',
    'engineering-sso',
  ]) {
    await search.fill(baseIdentity);
    await expect(popup.locator('.result-row')).toHaveCount(0);
  }

  await search.fill('111111111113');
  await expect(popup.locator('.result-row')).toHaveCount(2);
  await expect(popup.locator('.result-role')).toHaveText([
    'engineering-default',
    'engineering-readonly',
  ]);

  await popup.close();
  await awsPage.close();
});

test('Org action Popup fails closed for conflict and unknown context', async ({ roo }) => {
  await roo.seedStorage(organizationCatalogSeed());

  const conflictPage = await openSyntheticAwsPage(roo, {
    login: '111111111111',
    current: corporateAccount,
  });
  const conflictPopup = await openRooActionPopupForPage(roo, conflictPage);
  await expect(conflictPopup.getByText('AWS account context conflicts with Roo organization ownership.')).toBeVisible();
  await expect(conflictPopup.getByLabel('Search AWS destinations')).toBeDisabled();
  await expect(conflictPopup.locator('.result-row')).toHaveCount(0);
  await conflictPopup.close();
  await conflictPage.close();

  const unknownPage = await openSyntheticAwsPage(roo, {
    login: null,
    current: '999999999999',
  });
  const unknownPopup = await openRooActionPopupForPage(roo, unknownPage);
  await expect(unknownPopup.getByText('Current AWS account is not assigned to a Roo organization.')).toBeVisible();
  await expect(unknownPopup.locator('.result-row')).toHaveCount(0);
  await unknownPopup.close();
  await unknownPage.close();
});

test('two AWS tabs resolve independently through the real extension action', async ({ roo }) => {
  await roo.seedStorage(organizationCatalogSeed());
  const engineeringPage = await openSyntheticAwsPage(roo, { login: '111111111111', current: null });
  const corporatePage = await openSyntheticAwsPage(roo, { login: '222222222222', current: null });

  const corporatePopup = await openRooActionPopupForPage(roo, corporatePage);
  await expectPopupAccount(corporatePopup, corporateAccount, 2, '1 accounts · 2 roles');
  await corporatePopup.close();

  const engineeringPopup = await openRooActionPopupForPage(roo, engineeringPage);
  await expectPopupAccount(engineeringPopup, engineeringAccount, 2, '1 accounts · 2 roles');
  await engineeringPopup.close();
});
