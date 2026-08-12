import { test as base, expect, type Page } from '@playwright/test';
import {
  closeRooExtension,
  launchRooExtension,
  openOptions,
  openPopup,
  type RooExtension,
} from './fixtures';

const CONFIGURATION_KEY = 'roo-configuration-v1';
const FORMER_KEYS = [
  'roo-catalog-v1',
  'roo-catalog-v2',
  'roo-catalog-v3',
  'roo-catalog-v4',
  ['roo', 'local', 'accounts-v3'].join('-'),
];

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

function oneDestinationSource(project = 'atlas', accountId = '111111111111') {
  return `version: 1
projects:
  ${project}:
    accounts:
      prod: "${accountId}"
    roles:
      platform/read-only: {}
`;
}

async function replaceEditorSource(page: Page, source: string) {
  const editor = page.locator('.configuration-editor .cm-content');
  await editor.fill(source);
  await expect.poll(async () => (await editor.innerText()).trimEnd()).toBe(source.trimEnd());
}

async function selectConfigurationFile(
  page: Page,
  actionName: 'Upload YAML / JSON' | 'Replace file',
  name: string,
  source: string,
) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: actionName }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name,
    mimeType: name.endsWith('.json') ? 'application/json' : 'application/yaml',
    buffer: Buffer.from(source),
  });
  await expect(page.getByRole('heading', { name: 'Configuration editor' })).toBeVisible();
}

async function readConfiguration(roo: RooExtension) {
  const storage = await roo.readStorage([CONFIGURATION_KEY]);
  return storage[CONFIGURATION_KEY] as Record<string, unknown> | undefined;
}

async function saveConfiguration(page: Page) {
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved.')).toBeVisible();
}

test('created configuration can be cleared only after confirmation and Save', async ({ roo }) => {
  const page = await openOptions(roo);
  await page.getByRole('button', { name: 'New configuration' }).click();
  await replaceEditorSource(page, oneDestinationSource());
  await saveConfiguration(page);

  await expect(page.getByText('roo.yaml')).toBeVisible();
  await expect(page.getByText('Created in Roo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  const popupBefore = await openPopup(roo);
  await popupBefore.getByLabel('Search AWS destinations').fill('atlas');
  await expect(popupBefore.locator('.result-row')).toContainText('atlas-prod');
  await popupBefore.close();

  const storedBeforeClear = await readConfiguration(roo);
  await page.getByRole('button', { name: 'Edit configuration' }).click();
  await expect(page.getByText('Uploaded from', { exact: false })).toHaveCount(0);
  const sourceBeforeClear = await page.locator('.configuration-editor .cm-content').innerText();
  await page.getByRole('button', { name: 'Clear configuration' }).click();
  await expect(page.getByText('Clear configuration?')).toBeVisible();
  await expect(page.getByText(
    'This removes all projects, accounts, and roles from this configuration.',
  )).toBeVisible();
  await expect(page.getByText('The configuration itself remains in Roo.')).toBeVisible();
  expect(await readConfiguration(roo)).toEqual(storedBeforeClear);

  await page.getByRole('button', { name: 'Cancel clear' }).click();
  expect(await page.locator('.configuration-editor .cm-content').innerText()).toBe(sourceBeforeClear);
  expect(await readConfiguration(roo)).toEqual(storedBeforeClear);

  await page.getByRole('button', { name: 'Clear configuration' }).click();
  await page.getByRole('button', { name: 'Clear configuration' }).click();
  await expect(page.locator('.candidate-preview')).toContainText('Projects0');
  await expect(page.locator('.candidate-preview')).toContainText('Accounts0');
  await expect(page.locator('.candidate-preview')).toContainText('Roles0');
  await expect(page.locator('.configuration-editor .cm-content')).toContainText('projects:');
  expect(await readConfiguration(roo)).toEqual(storedBeforeClear);
  await saveConfiguration(page);

  expect(await readConfiguration(roo)).toMatchObject({
    catalogVersion: 2,
    source: { kind: 'created' },
    config: { projects: {} },
  });
  await expect(page.getByText('Created in Roo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  const popupAfter = await openPopup(roo);
  await expect(popupAfter.getByText('0 accounts · 0 roles')).toBeVisible();
  await expect(popupAfter.getByText('No AWS destinations configured.')).toBeVisible();
  await expect(popupAfter.getByText('No configuration imported.')).toHaveCount(0);
  await popupAfter.getByLabel('Search AWS destinations').fill('atlas');
  await expect(popupAfter.locator('.result-row')).toHaveCount(0);
  await popupAfter.close();

  await expect(page.getByText('roo.yaml')).toBeVisible();
  await expect(page.getByText('Created in Roo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit configuration' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace file' })).toBeVisible();
});

test('uploaded configuration can be deleted using original filename confirmation', async ({ roo }) => {
  const page = await openOptions(roo);
  const source = JSON.stringify({
    version: 1,
    projects: { atlas: { accounts: { prod: '111111111111' } } },
  });
  await selectConfigurationFile(page, 'Upload YAML / JSON', 'team.json', source);
  await saveConfiguration(page);

  await expect(page.getByText('team.json')).toBeVisible();
  await expect(page.getByText('team.yaml')).toHaveCount(0);
  await expect(page.getByText('Uploaded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Type team.json to confirm.')).toBeVisible();
  const confirmation = page.getByLabel('Confirmation uploaded filename');
  const permanently = page.getByRole('button', { name: 'Delete permanently' });

  for (const value of ['team.yaml', 'TEAM.JSON', ' team.json', 'team.json ']) {
    await confirmation.fill(value);
    await expect(permanently).toBeDisabled();
  }
  await confirmation.fill('team.json');
  await expect(permanently).toBeEnabled();
  expect(await readConfiguration(roo)).toBeDefined();
  await permanently.click();

  await expect(page.getByText('Configuration deleted.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New configuration' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload YAML / JSON' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit configuration' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replace file' })).toHaveCount(0);
  expect(await readConfiguration(roo)).toBeUndefined();
  const popup = await openPopup(roo);
  await expect(popup.getByText('No configuration imported.')).toBeVisible();
});

test('uploaded roo.yaml remains uploaded and can be deleted', async ({ roo }) => {
  const page = await openOptions(roo);
  await selectConfigurationFile(
    page,
    'Upload YAML / JSON',
    'roo.yaml',
    oneDestinationSource('uploaded-roo'),
  );
  await saveConfiguration(page);

  expect(await readConfiguration(roo)).toMatchObject({
    source: { kind: 'uploaded', fileName: 'roo.yaml' },
  });
  await expect(page.getByText('roo.yaml')).toBeVisible();
  await expect(page.getByText('Uploaded', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit configuration' }).click();
  await expect(page.getByText('Uploaded from roo.yaml')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear configuration' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Type roo.yaml to confirm.')).toBeVisible();
  await page.getByLabel('Confirmation uploaded filename').fill('roo.yaml');
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('Configuration deleted.')).toBeVisible();
  expect(await readConfiguration(roo)).toBeUndefined();
});

test('replacing created configuration with uploaded roo.yaml changes identity only after Save', async ({ roo }) => {
  const page = await openOptions(roo);
  await page.getByRole('button', { name: 'New configuration' }).click();
  await saveConfiguration(page);
  await expect(page.getByText('Created in Roo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);

  const replacement = oneDestinationSource('replacement', '222222222222');
  await selectConfigurationFile(page, 'Replace file', 'roo.yaml', replacement);
  expect(await readConfiguration(roo)).toMatchObject({ source: { kind: 'created' } });
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await readConfiguration(roo)).toMatchObject({ source: { kind: 'created' } });

  await selectConfigurationFile(page, 'Replace file', 'roo.yaml', replacement);
  await saveConfiguration(page);
  expect(await readConfiguration(roo)).toMatchObject({
    source: { kind: 'uploaded', fileName: 'roo.yaml' },
  });
  await expect(page.getByText('Uploaded', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit configuration' }).click();
  await expect(page.getByRole('button', { name: 'Clear configuration' })).toHaveCount(0);
});

test('Configuration lifecycle leaves all former development keys inert', async ({ roo }) => {
  const markers = Object.fromEntries(FORMER_KEYS.map((key) => [key, { marker: key }]));
  await roo.seedStorage({
    ...markers,
    [CONFIGURATION_KEY]: {
      storageVersion: 1,
      catalogVersion: 1,
      source: { kind: 'uploaded', fileName: 'initial.json' },
      config: {
        version: 1,
        defaults: { enabled: false, roles: [] },
        projects: {},
      },
    },
  });
  const page = await openOptions(roo);

  await page.getByRole('button', { name: 'Edit configuration' }).click();
  await saveConfiguration(page);
  await selectConfigurationFile(
    page,
    'Replace file',
    'replacement.yaml',
    oneDestinationSource('replacement'),
  );
  await saveConfiguration(page);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByLabel('Confirmation uploaded filename').fill('replacement.yaml');
  await page.getByRole('button', { name: 'Delete permanently' }).click();

  expect(await roo.readStorage(FORMER_KEYS)).toEqual(markers);
  await page.reload();
  await expect(page.getByText('No configuration imported.')).toBeVisible();
});
