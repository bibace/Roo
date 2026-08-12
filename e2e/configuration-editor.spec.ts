import { test as base, expect, type Page } from '@playwright/test';
import {
  closeRooExtension,
  launchRooExtension,
  openOptions,
  openPopup,
  type RooExtension,
} from './fixtures';
import './configuration-lifecycle-tests';

const CONFIGURATION_KEY = 'roo-configuration-v1';
const FORMER_CATALOG_KEY = 'roo-catalog-v4';
const ROO_STORAGE_KEYS = [
  'roo-configuration-v1',
  FORMER_CATALOG_KEY,
  'roo-catalog-v3',
  'roo-catalog-v2',
  'roo-catalog-v1',
];
const FORMER_STORAGE_KEY = ['roo', 'local', 'accounts-v3'].join('-');

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

function persistedCatalog(
  config: Record<string, unknown>,
  catalogVersion = 1,
  source: { kind: 'created' } | { kind: 'uploaded'; fileName: string } = {
    kind: 'uploaded',
    fileName: 'current.json',
  },
) {
  return {
    storageVersion: 1,
    catalogVersion,
    source,
    config,
  };
}

async function selectConfigurationFile(
  page: Page,
  actionName: 'Upload YAML / JSON' | 'Replace file',
  name: string,
  source: string,
  mimeType = 'application/json',
) {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: actionName }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name, mimeType, buffer: Buffer.from(source) });
  await expect(page.getByRole('heading', { name: 'Configuration editor' })).toBeVisible();
}

async function replaceEditorSource(page: Page, source: string) {
  const editor = page.locator('.configuration-editor .cm-content');
  await editor.fill(source);
  await expect.poll(async () => (await editor.innerText()).trimEnd()).toBe(source.trimEnd());
}

async function readCatalog(roo: RooExtension) {
  const storage = await roo.readStorage([CONFIGURATION_KEY]);
  return storage[CONFIGURATION_KEY] as Record<string, unknown> | undefined;
}

test('Settings exposes the lazy Configuration Guide and release metadata', async ({ roo }) => {
  const page = await openOptions(roo);
  const logo = page.locator('.settings-logo');
  await expect(logo).toHaveCount(1);
  await expect(logo).toBeVisible();

  const logoMetadata = await logo.evaluate((element) => {
    const image = element as HTMLImageElement;
    const imageRect = image.getBoundingClientRect();
    const heading = image.parentElement?.querySelector('h1');
    const headingRect = heading?.getBoundingClientRect();

    return {
      src: image.src,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: imageRect.width,
      renderedHeight: imageRect.height,
      headingText: heading?.textContent,
      headingBesideImage: Boolean(
        headingRect &&
        headingRect.left >= imageRect.right &&
        headingRect.top < imageRect.bottom &&
        headingRect.bottom > imageRect.top,
      ),
    };
  });

  const optionsUrl = new URL(page.url());
  const logoUrl = new URL(logoMetadata.src);
  expect(logoUrl.protocol).toBe('chrome-extension:');
  expect(logoUrl.origin).toBe(optionsUrl.origin);
  expect(logoMetadata.src).toMatch(/\/icons\/48\.png$/);
  expect(logoMetadata.naturalWidth).toBe(48);
  expect(logoMetadata.naturalHeight).toBe(48);
  expect(logoMetadata.renderedWidth).toBe(48);
  expect(logoMetadata.renderedHeight).toBe(48);
  expect(logoMetadata.headingText).toBe('Roo Settings');
  expect(logoMetadata.headingBesideImage).toBe(true);

  const guideSummary = page.locator('summary', { hasText: /^Configuration Guide$/ });

  await expect(guideSummary).toBeVisible();
  await expect(page.getByText('Configuration YAML Reference', { exact: true })).toHaveCount(0);

  await guideSummary.click();

  await expect(page.getByText('Configuration YAML Reference', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 1 — Simple Mode' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 2 — Organization Mode' })).toBeVisible();
  await expect(page.getByLabel('Version 1 configuration example')).toContainText('version: 1');
  await expect(page.getByLabel('Version 2 configuration example')).toContainText('version: 2');
  await expect(page.getByLabel('Version 2 configuration example')).toContainText('organizations:');
  await expect(page.getByLabel('Version 2 configuration example')).toContainText('base_accounts:');

  await expect(page.getByText('nova', { exact: true })).toBeVisible();
  const repositoryLink = page.getByRole('link', { name: 'github.com/bibace/Roo' });
  await expect(repositoryLink).toBeVisible();
  await expect(repositoryLink).toHaveAttribute('href', 'https://github.com/bibace/Roo');
  await expect(repositoryLink).toHaveAttribute('target', '_blank');
  expect((await repositoryLink.getAttribute('rel'))?.split(/\s+/)).toContain('noreferrer');
});

test('empty Configuration renders only New and Upload entry actions', async ({ roo }) => {
  const page = await openOptions(roo);

  await expect(page.getByRole('button', { name: 'New configuration' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload YAML / JSON' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit configuration' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replace file' })).toHaveCount(0);
});

test('ready created Configuration renders only Edit and Replace entry actions', async ({ roo }) => {
  await roo.seedStorage({
    [CONFIGURATION_KEY]: persistedCatalog({
      version: 1,
      defaults: { enabled: false, roles: [] },
      projects: {},
    }, 1, { kind: 'created' }),
  });
  const page = await openOptions(roo);

  await expect(page.getByRole('button', { name: 'Edit configuration' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New configuration' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Upload YAML / JSON' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
});

test('ready uploaded Configuration renders Edit, Replace, and Delete entry actions', async ({ roo }) => {
  await roo.seedStorage({
    [CONFIGURATION_KEY]: persistedCatalog({
      version: 1,
      defaults: { enabled: false, roles: [] },
      projects: {},
    }),
  });
  const page = await openOptions(roo);

  await expect(page.getByRole('button', { name: 'Edit configuration' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New configuration' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Upload YAML / JSON' })).toHaveCount(0);
});

test('invalid formal Configuration renders only Replace entry action', async ({ roo }) => {
  await roo.seedStorage({
    [CONFIGURATION_KEY]: { storageVersion: 1, catalogVersion: 0 },
  });
  const page = await openOptions(roo);

  await expect(page.getByText(
    'Stored configuration is invalid. Replace it with a valid YAML or JSON file.',
  )).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New configuration' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Upload YAML / JSON' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit configuration' })).toHaveCount(0);
});

test('JSON upload canonicalizes to YAML and persists only normalized configuration', async ({ roo }) => {
  const page = await openOptions(roo);
  const rawJson = '{"version":1,"projects":{"atlas":{"accounts":{"prod":"111111111111"}}}}';

  await selectConfigurationFile(page, 'Upload YAML / JSON', 'team-config.json', rawJson);
  await expect(page.locator('.configuration-editor .cm-editor')).toBeVisible();
  await expect(page.locator('.configuration-editor textarea')).toHaveCount(0);
  await expect(page.getByText('team-config.yaml')).toBeVisible();
  await expect(page.getByText('Canonical YAML')).toBeVisible();
  const editorText = await page.locator('.configuration-editor .cm-content').innerText();
  expect(editorText).toContain('version:');
  expect(editorText).toContain('projects:');
  expect(editorText).toContain('accounts:');
  expect(editorText).not.toBe(rawJson);

  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved.')).toBeVisible();

  const stored = await readCatalog(roo);
  expect(stored).toMatchObject({
    storageVersion: 1,
    catalogVersion: 1,
    source: { kind: 'uploaded', fileName: 'team-config.json' },
    config: {
      version: 1,
      defaults: { enabled: false, roles: [] },
      projects: {
        atlas: {
          accounts: { prod: '111111111111' },
          roles: {},
        },
      },
    },
  });
  expect(JSON.stringify(stored)).not.toMatch(/sourceText|rawSource|draft|history|catalogs/);
});

test('CodeMirror preserves required keyboard editing and external replacement behavior', async ({ roo }) => {
  const page = await openOptions(roo);
  await page.getByRole('button', { name: 'New configuration' }).click();

  const editor = page.locator('.configuration-editor .cm-content');
  await expect(page.locator('.configuration-editor .cm-editor')).toBeVisible();
  await expect(editor).toHaveAttribute('aria-label', 'Configuration YAML');
  await expect.poll(() => editor.locator('.cm-line span').count()).toBeGreaterThan(0);

  await editor.click();
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.press('Tab');
  await editor.pressSequentially('# keyboard-marker');
  await expect(editor).toContainText('# keyboard-marker');

  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('# keyboard-marker');
  await editor.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y');
  await expect(editor).toContainText('# keyboard-marker');

  const noncanonical = 'version: 1\nprojects: { formatted: { accounts: {}, roles: {} } }\n';
  await replaceEditorSource(page, noncanonical);
  await expect(page.getByText('Configuration is valid.')).toBeVisible();
  await page.getByRole('button', { name: 'Format YAML' }).click();
  await expect(editor).toContainText('formatted:');
  await expect.poll(async () => (await editor.innerText()).trimEnd()).not.toBe(
    noncanonical.trimEnd(),
  );
});

test('CodeMirror is read-only while a Save mutation is active', async ({ roo }) => {
  const page = await openOptions(roo);
  await page.getByRole('button', { name: 'New configuration' }).click();
  const editor = page.locator('.configuration-editor .cm-content');

  await roo.serviceWorker.evaluate(() => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: {
        storage: {
          local: {
            set: (values: Record<string, unknown>) => Promise<void>;
          };
        };
      };
      releaseRooStorageSet?: () => void;
    };
    const originalSet = extensionGlobal.chrome.storage.local.set.bind(
      extensionGlobal.chrome.storage.local,
    );
    const gate = new Promise<void>((resolve) => {
      extensionGlobal.releaseRooStorageSet = resolve;
    });

    extensionGlobal.chrome.storage.local.set = async (values) => {
      await gate;
      await originalSet(values);
    };
  });

  const saveClick = page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled();

  await roo.serviceWorker.evaluate(() => {
    const extensionGlobal = globalThis as typeof globalThis & {
      releaseRooStorageSet?: () => void;
    };
    extensionGlobal.releaseRooStorageSet?.();
  });
  await saveClick;
  await expect(page.getByText('Configuration saved.')).toBeVisible();
});

test('YAML upload discards raw comments and formatting', async ({ roo }) => {
  const page = await openOptions(roo);
  const rawYaml = `# original comment
version: 1

projects:
    atlas:
      accounts: { prod: "111111111111" }
`;

  await selectConfigurationFile(
    page,
    'Upload YAML / JSON',
    'comments.yml',
    rawYaml,
    'application/yaml',
  );
  const editorText = await page.locator('.configuration-editor .cm-content').innerText();
  expect(editorText).not.toContain('original comment');
  expect(editorText).toContain('  atlas:');
  expect(editorText).toContain('    accounts:');

  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved.')).toBeVisible();
  const stored = await readCatalog(roo);
  expect(stored?.source).toEqual({ kind: 'uploaded', fileName: 'comments.yml' });
  expect(JSON.stringify(stored)).not.toContain('original comment');
  expect(JSON.stringify(stored)).not.toContain(rawYaml);
});

test('invalid edit and Cancel preserve the current catalog', async ({ roo }) => {
  const initial = persistedCatalog({
    version: 1,
    defaults: { enabled: false, roles: [] },
    projects: {
      atlas: {
        accounts: { prod: '111111111111' },
        roles: { 'platform/read-only': {} },
      },
    },
  });
  await roo.seedStorage({ [CONFIGURATION_KEY]: initial });
  const page = await openOptions(roo);
  const before = await readCatalog(roo);

  await page.getByRole('button', { name: 'Edit configuration' }).click();
  await replaceEditorSource(page, 'version: [');
  await expect(page.getByText('Unable to parse configuration.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled();
  expect(await readCatalog(roo)).toEqual(before);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('current.json')).toBeVisible();
  expect(await readCatalog(roo)).toEqual(before);
});

test('editing the current configuration replaces it for Popup Search', async ({ roo }) => {
  await roo.seedStorage({
    [CONFIGURATION_KEY]: persistedCatalog({
      version: 1,
      defaults: { enabled: false, roles: [] },
      projects: {
        atlas: {
          accounts: { prod: '111111111111' },
          roles: { 'platform/read-only': {} },
        },
      },
    }),
  });
  const page = await openOptions(roo);
  await page.getByRole('button', { name: 'Edit configuration' }).click();
  await replaceEditorSource(page, `version: 1
defaults:
  enabled: false
  roles: []
projects:
  nova:
    accounts:
      staging: "222222222222"
    roles:
      platform/admin: {}
`);
  await expect(page.getByText('Configuration is valid.')).toBeVisible();
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved.')).toBeVisible();

  const storage = await roo.readStorage(ROO_STORAGE_KEYS);
  expect(Object.keys(storage).filter((key) => key.startsWith('roo-configuration'))).toEqual([CONFIGURATION_KEY]);
  expect(storage[CONFIGURATION_KEY]).toMatchObject({
    catalogVersion: 2,
    source: { kind: 'uploaded', fileName: 'current.json' },
  });

  const popup = await openPopup(roo);
  await popup.getByLabel('Search AWS destinations').fill('nova');
  await expect(popup.locator('.result-row')).toContainText('nova-staging');
  await popup.getByLabel('Search AWS destinations').fill('atlas');
  await expect(popup.locator('.result-row')).toHaveCount(0);
});

test('editor validates only the latest debounced source', async ({ roo }) => {
  await roo.seedStorage({
    [CONFIGURATION_KEY]: persistedCatalog({
      version: 1,
      defaults: { enabled: false, roles: [] },
      projects: {
        atlas: {
          accounts: { prod: '111111111111' },
          roles: { 'platform/read-only': {} },
        },
      },
    }),
  });
  const page = await openOptions(roo);

  await page.getByRole('button', { name: 'Edit configuration' }).click();
  await expect(page.locator('.configuration-editor .cm-editor')).toBeVisible();
  await replaceEditorSource(page, 'version: [');
  await expect(page.getByText('Checking configuration…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Format YAML' })).toBeDisabled();
  await expect(page.getByText('Unable to parse configuration.')).toBeVisible();

  await replaceEditorSource(page, `version: 1
projects:
  zephyr:
    accounts:
      prod: "999999999999"
    roles:
      platform/operator: {}
`);
  await expect(page.getByText('Checking configuration…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled();
  await expect(page.getByText('Configuration is valid.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
  await expect(page.getByText('Unable to parse configuration.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved.')).toBeVisible();

  const popup = await openPopup(roo);
  await popup.getByLabel('Search AWS destinations').fill('zephyr');
  await expect(popup.locator('.result-row')).toContainText('zephyr-prod');
});

test('created Configuration keeps created identity across Edit and Save', async ({ roo }) => {
  const page = await openOptions(roo);

  await page.getByRole('button', { name: 'New configuration' }).click();
  await replaceEditorSource(page, `version: 1
projects:
  created:
    accounts:
      prod: "333333333333"
    roles:
      platform/read-only: {}
  `);
  await expect(page.getByText('Configuration is valid.')).toBeVisible();
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved.')).toBeVisible();

  expect(await readCatalog(roo)).toMatchObject({
    catalogVersion: 1,
    source: { kind: 'created' },
  });

  await page.getByRole('button', { name: 'Edit configuration' }).click();
  await expect(page.getByText('roo.yaml')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved.')).toBeVisible();
  expect(await readCatalog(roo)).toMatchObject({
    catalogVersion: 2,
    source: { kind: 'created' },
  });
});

test('Replace changes created identity only after Save', async ({ roo }) => {
  const page = await openOptions(roo);
  await page.getByRole('button', { name: 'New configuration' }).click();
  await replaceEditorSource(page, `version: 1
projects:
  original:
    accounts:
      prod: "333333333333"
    roles:
      platform/read-only: {}
`);
  await expect(page.getByText('Configuration is valid.')).toBeVisible();
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved.')).toBeVisible();
  const original = await readCatalog(roo);

  const replacement = JSON.stringify({
    version: 1,
    projects: {
      replacement: {
        accounts: { prod: '444444444444' },
        roles: { 'platform/read-only': {} },
      },
    },
  });
  await selectConfigurationFile(page, 'Replace file', 'replacement.json', replacement);
  await expect(page.getByText('replacement.yaml')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await readCatalog(roo)).toEqual(original);

  await selectConfigurationFile(page, 'Replace file', 'replacement.json', replacement);
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved.')).toBeVisible();
  expect(await readCatalog(roo)).toMatchObject({
    catalogVersion: 2,
    source: { kind: 'uploaded', fileName: 'replacement.json' },
  });

  const popup = await openPopup(roo);
  await popup.getByLabel('Search AWS destinations').fill('replacement');
  await expect(popup.locator('.result-row')).toContainText('replacement-prod');
});

test('Format YAML canonicalizes without writing storage before normal Save', async ({ roo }) => {
  const initial = persistedCatalog({
    version: 1,
    defaults: { enabled: false, roles: [] },
    projects: {},
  });
  await roo.seedStorage({ [CONFIGURATION_KEY]: initial });
  const page = await openOptions(roo);
  await page.getByRole('button', { name: 'Edit configuration' }).click();
  const noncanonical = 'version: 1\nprojects: { formatted: { accounts: { dev: "444444444444" }, roles: { platform/view: {} } } }\n';
  await replaceEditorSource(page, noncanonical);
  await expect(page.getByText('Configuration is valid.')).toBeVisible();

  await page.getByRole('button', { name: 'Format YAML' }).click();
  const formatted = await page.locator('.configuration-editor .cm-content').innerText();
  expect(formatted).toContain('projects:\n  formatted:');
  expect(formatted).not.toBe(noncanonical);
  expect(await readCatalog(roo)).toEqual(initial);

  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('Configuration saved.')).toBeVisible();
  expect(await readCatalog(roo)).toMatchObject({ catalogVersion: 2 });
});

test('unsaved configuration draft markers never persist', async ({ roo }) => {
  const page = await openOptions(roo);
  const marker = 'memory-only-marker';
  await page.getByRole('button', { name: 'New configuration' }).click();
  await replaceEditorSource(page, `version: 1
projects:
  ${marker}:
    accounts: {}
    roles: {}
`);

  expect(JSON.stringify(await roo.readStorage(ROO_STORAGE_KEYS))).not.toContain(marker);
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(JSON.stringify(await roo.readStorage(ROO_STORAGE_KEYS))).not.toContain(marker);
});

test('Options and runtime are configuration-only', async ({ roo }) => {
  const marker = 'retired-storage-marker';
  await roo.seedStorage({
    [CONFIGURATION_KEY]: persistedCatalog({
      version: 1,
      defaults: { enabled: false },
      projects: {
        sentinel: {
          accounts: { dev: '777777777777' },
          roles: { 'platform/marker-readonly': {} },
        },
      },
    }),
    [FORMER_CATALOG_KEY]: { marker },
    [FORMER_STORAGE_KEY]: { marker },
  });

  const options = await openOptions(roo);
  await expect(options.getByRole('heading', { name: ['Local', 'accounts'].join(' ') })).toHaveCount(0);
  await expect(options.getByRole('button', { name: '+ Add account' })).toHaveCount(0);

  const popup = await openPopup(roo);
  const search = popup.getByLabel('Search AWS destinations');
  await search.fill('sentinel');
  await expect(popup.locator('.result-row')).toContainText('sentinel-dev');
  await search.fill(marker);
  await expect(popup.locator('.result-row')).toHaveCount(0);

  expect(await roo.readStorage([FORMER_CATALOG_KEY, FORMER_STORAGE_KEY])).toEqual({
    [FORMER_CATALOG_KEY]: { marker },
    [FORMER_STORAGE_KEY]: { marker },
  });
});
