import {
  chromium,
  expect,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
  type Route,
  type Worker,
} from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { JumpTarget } from '../src/domain/jump-target';

declare const chrome: {
  storage: {
    local: {
      clear: () => Promise<void>;
      set: (values: Record<string, unknown>) => Promise<void>;
      get: (keys: string[]) => Promise<Record<string, unknown>>;
    };
  };
  tabs: {
    query: (queryInfo: { active: boolean; windowId: number }) =>
      Promise<Array<{ id?: number }>>;
  };
  action: {
    isEnabled: (tabId: number) => Promise<boolean>;
  };
};

export interface RooExtension {
  debugBrowser: Browser;
  debugEndpoint: string;
  context: BrowserContext;
  serviceWorker: Worker;
  extensionUrl: string;
  clearStorage: () => Promise<void>;
  seedStorage: (values: Record<string, unknown>) => Promise<void>;
  readStorage: (keys: string[]) => Promise<Record<string, unknown>>;
  watchExtensionPage: (page: Page) => void;
  assertNoRuntimeErrors: () => Promise<void>;
}

export const SEARCH_SCALE_TARGET_COUNT = 1_000;

export function createSearchScaleCatalogSeed(
  targetCount = SEARCH_SCALE_TARGET_COUNT,
): { storage: Record<string, unknown>; targets: JumpTarget[] } {
  const project = 'scale-search';
  const role = 'platform/scale-readonly';
  const accounts: Record<string, string> = {};
  const targets: JumpTarget[] = [];

  for (let index = 0; index < targetCount; index += 1) {
    const environment = `env-${String(index).padStart(4, '0')}`;
    const accountId = String(100_000_000_000 + index);
    const accountName = `${project}-${environment}`;
    accounts[environment] = accountId;
    targets.push({
      accountId,
      accountName,
      project,
      environment,
      role,
      roleShortName: 'scale-readonly',
    });
  }

  return {
    storage: {
      'roo-configuration-v1': {
        storageVersion: 1,
        catalogVersion: 1,
        source: { kind: 'uploaded', fileName: 'search-scale.json' },
        config: {
          version: 1,
          defaults: { enabled: false },
          projects: {
            [project]: {
              accounts,
              roles: { [role]: {} },
            },
          },
        },
      },
    },
    targets,
  };
}

export interface LegacySwitchRolePostExpectation {
  ready: Promise<void>;
  done: Promise<void>;
}

export type RooActionTriggerResult =
  | {
      status: 'triggered';
      popupAppeared: boolean;
    }
  | {
      status: 'protocol-rejected';
      popupAppeared: false;
      message: string;
    };

const rooTabTargetIds = new WeakMap<Page, string>();

export function expectLegacySwitchRolePost(
  extension: RooExtension,
  originatingUrl: string,
  expected: { account: string; roleName: string; displayName: string },
): LegacySwitchRolePostExpectation {
  const page = extension.context.pages().find(
    (candidate) => candidate.url() === originatingUrl,
  );

  if (!page) {
    throw new Error(
      `The originating AWS page ${originatingUrl} was not found.`,
    );
  }

  const requestUrl =
    'https://signin.aws.amazon.com/switchrole';
  let resolveRequest: (() => void) | undefined;
  let rejectRequest: ((error: unknown) => void) | undefined;

  const requestPromise = new Promise<void>((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  const navigationPromise = page.waitForURL(requestUrl, {
    waitUntil: 'load',
  });
  const routeHandler = async (route: Route) => {
    try {
      const request = route.request();
      const url = new URL(request.url());
      const form = new URLSearchParams(
        request.postData() ?? '',
      );
      const expectedKeys = [
        'mfaNeeded',
        'action',
        'src',
        'csrf',
        'roleName',
        'account',
        'color',
        'redirect_uri',
        'displayName',
      ];

      expect(request.method()).toBe('POST');
      expect(url.hostname).toBe('signin.aws.amazon.com');
      expect(url.pathname).toBe('/switchrole');
      expect(url.search).toBe('');
      expect([...form.keys()]).toEqual(expectedKeys);
      expect(form.get('mfaNeeded')).toBe('0');
      expect(form.get('action')).toBe('switchFromBasis');
      expect(form.get('src')).toBe('nav');
      expect(form.get('csrf')).toBe('1234567890');
      expect(form.get('account')).toBe(expected.account);
      expect(form.get('roleName')).toBe(expected.roleName);
      expect(form.get('color')).toBe('aaaaaa');
      expect(form.get('displayName')).toBe(expected.displayName);

      const redirectUri = form.get('redirect_uri');

      expect(redirectUri).not.toBeNull();

      expect(
        decodeURIComponent(redirectUri ?? ''),
      ).toBe(originatingUrl);

      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body:
          '<!doctype html><title>Legacy Switch Role Complete</title>',
      });
      resolveRequest?.();
    } catch (error) {
      rejectRequest?.(error);
      await route.abort().catch(() => undefined);
    }
  };

  const ready = page
    .route(requestUrl, routeHandler, { times: 1 })
    .then(() => undefined);

  return {
    ready,
    done: Promise.all([requestPromise, navigationPromise]).then(
      () => undefined,
    ),
  };
}

export async function expectPrismSwitchRoleRequest(
  extension: RooExtension,
  originatingUrl: string,
  expectedRedirectUri: string,
  expected: { account: string; roleName: string; displayName: string },
): Promise<void> {
  const page = extension.context.pages().find((candidate) => candidate.url() === originatingUrl);

  if (!page) {
    throw new Error(`The originating AWS page ${originatingUrl} was not found.`);
  }

  const sessionDifferentiator = new URL(originatingUrl).hostname.split('.')[0] ?? '';
  const requestUrl =
    `https://signin.aws.amazon.com/sessions/${encodeURIComponent(sessionDifferentiator)}/v1/switchrole`;
  let resolveRequest: (() => void) | undefined;
  let rejectRequest: ((error: unknown) => void) | undefined;
  const requestPromise = new Promise<void>((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  const routeHandler = async (route: Route) => {
    try {
      const request = route.request();
      const body = JSON.parse(request.postData() ?? '') as unknown;

      expect(request.method()).toBe('POST');
      expect(request.url()).toBe(requestUrl);
      expect(await request.headerValue('X-CSRF-PROTECTION')).toBe('1');
      expect(await request.headerValue('content-type')).toContain('application/json');
      expect(body).toEqual({
        account: expected.account,
        color: 'aaaaaa',
        displayName: expected.displayName,
        redirectUri: expectedRedirectUri,
        roleName: expected.roleName,
      });

      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          destination: 'https://999999999999-bbbbbbbb.us-east-1.console.aws.amazon.com/console/home?region=us-east-1',
        }),
      });
      resolveRequest?.();
    } catch (error) {
      rejectRequest?.(error);
      await route.abort().catch(() => undefined);
    } finally {
      await page.unroute(requestUrl, routeHandler).catch(() => undefined);
    }
  };

  await page.route(requestUrl, routeHandler);
  return requestPromise;
}

async function findFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error('Unable to allocate a Chromium CDP port.');
  }
  const port = (address as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function waitForNewTargetUrl(
  browserSession: CDPSession,
  targetUrl: string,
  existingTargetIds: ReadonlySet<string>,
  timeoutMs: number,
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { targetInfos } = await browserSession.send('Target.getTargets');
    const target = targetInfos.find((candidate) =>
      candidate.url === targetUrl && !existingTargetIds.has(candidate.targetId),
    );

    if (target) {
      return target.targetId;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return undefined;
}

export async function launchRooExtension(
  artifactTarget = process.env.ROO_E2E_ARTIFACT_TARGET ?? 'chrome',
): Promise<RooExtension & { userDataDirectory: string }> {
  if (artifactTarget !== 'chrome' && artifactTarget !== 'edge') {
    throw new Error('Roo E2E artifact target must be chrome or edge.');
  }

  const extensionPath = path.resolve(`.output/${artifactTarget}-mv3`);
  const manifestPath = path.join(extensionPath, 'manifest.json');

  if (!existsSync(extensionPath)) {
    throw new Error(
      `Built ${artifactTarget}-target MV3 extension directory was not found at ${extensionPath}. Run npm run build:${artifactTarget} first.`,
    );
  }

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Built ${artifactTarget}-target MV3 extension manifest was not found at ${manifestPath}. Run npm run build:${artifactTarget} first.`,
    );
  }

  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'roo-e2e-'));
  const remoteDebuggingPort = await findFreePort();
  let context: BrowserContext | undefined;
  let debugBrowser: Browser | undefined;

  try {
    context = await chromium.launchPersistentContext(userDataDirectory, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--disable-gpu',
        '--disable-crash-reporter',
        '--enable-unsafe-extension-debugging',
        `--remote-debugging-port=${remoteDebuggingPort}`,
        '--host-resolver-rules=MAP signin.aws.amazon.com 127.0.0.1,MAP *.signin.aws.amazon.com 127.0.0.1,EXCLUDE localhost',
        `--crash-dumps-dir=${userDataDirectory}`,
      ],
    });

    const serviceWorker = context.serviceWorkers().find((worker) =>
      worker.url().startsWith('chrome-extension://'),
    ) ?? await context.waitForEvent('serviceworker', {
      predicate: (worker) => worker.url().startsWith('chrome-extension://'),
      timeout: 10_000,
    }).catch(() => {
      throw new Error('Roo MV3 service worker did not appear within 10 seconds.');
    });
    const extensionId = new URL(serviceWorker.url()).host;
    const extensionUrl = `chrome-extension://${extensionId}`;
    debugBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${remoteDebuggingPort}`);
    const debugContext = debugBrowser.contexts()[0];
    if (!debugContext) {
      throw new Error('The Chromium CDP connection did not expose the Roo browser context.');
    }
    const runtimeErrors: string[] = [];

    const watchPage = (page: Page, keepDialogsOpen = false) => {
      if (keepDialogsOpen) {
        page.on('dialog', () => undefined);
      }
      page.on('pageerror', (error) => {
        if (page.url().startsWith(extensionUrl)) {
          runtimeErrors.push(`pageerror: ${error.message}`);
        }
      });
      page.on('console', (message) => {
        if (message.type() === 'error' && page.url().startsWith(extensionUrl)) {
          runtimeErrors.push(`console.error: ${message.text()}`);
        }
      });
    };

    context.on('page', (page) => watchPage(page));
    context.on('console', (message) => {
      if (
        message.page() === null &&
        message.type() === 'error' &&
        message.location().url.startsWith(extensionUrl)
      ) {
        runtimeErrors.push(`console.error: ${message.text()}`);
      }
    });
    context.on('weberror', (webError) => {
      if (webError.location().url.startsWith(extensionUrl)) {
        runtimeErrors.push(`pageerror: ${webError.error().message}`);
      }
    });
    debugContext.on('page', (page) => watchPage(page, true));
    debugContext.on('console', (message) => {
      if (
        message.page() === null &&
        message.type() === 'error' &&
        message.location().url.startsWith(extensionUrl)
      ) {
        runtimeErrors.push(`console.error: ${message.text()}`);
      }
    });
    debugContext.on('weberror', (webError) => {
      if (webError.location().url.startsWith(extensionUrl)) {
        runtimeErrors.push(`pageerror: ${webError.error().message}`);
      }
    });
    for (const page of context.pages()) {
      watchPage(page);
    }
    for (const page of debugContext.pages()) {
      watchPage(page, true);
    }

    return {
      debugBrowser,
      debugEndpoint: `http://127.0.0.1:${remoteDebuggingPort}`,
      context,
      serviceWorker,
      extensionUrl,
      userDataDirectory,
      clearStorage: async () => {
        await serviceWorker.evaluate(async () => {
          await chrome.storage.local.clear();
        });
      },
      seedStorage: async (values) => {
        await serviceWorker.evaluate(async (storageValues) => {
          await chrome.storage.local.set(storageValues);
        }, values);
      },
      readStorage: async (keys) => serviceWorker.evaluate(async (storageKeys) => {
        return chrome.storage.local.get(storageKeys);
      }, keys),
      watchExtensionPage: watchPage,
      assertNoRuntimeErrors: async () => {
        expect(runtimeErrors, 'unexpected extension page or service worker runtime errors').toEqual([]);
      },
    };
  } catch (error) {
    await context?.close().catch(() => undefined);
    await debugBrowser?.close().catch(() => undefined);
    await rm(userDataDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function closeRooExtension(extension: RooExtension & { userDataDirectory: string }) {
  try {
    await extension.context.close();
  } finally {
    await extension.debugBrowser.close().catch(() => undefined);
    await rm(extension.userDataDirectory, { recursive: true, force: true });
  }
}

export async function openOptions(extension: RooExtension): Promise<Page> {
  const page = await extension.context.newPage();
  await page.goto(`${extension.extensionUrl}/options.html`);
  await expect(page.getByRole('heading', { name: 'Roo Settings' })).toBeVisible();
  await expect(page).toHaveTitle('Roo Settings');
  return page;
}

export async function openPopup(extension: RooExtension): Promise<Page> {
  const page = await extension.context.newPage();
  await page.goto(`${extension.extensionUrl}/popup.html`);
  await expect(page.getByLabel('Search AWS destinations')).toBeVisible();
  return page;
}

export async function openRooTestTab(extension: RooExtension): Promise<Page> {
  const browser = extension.context.browser();
  const anchorPage = extension.context.pages()[0];

  if (!browser || !anchorPage) {
    throw new Error('The Roo E2E context did not expose a browser tab.');
  }

  const anchorSession = await extension.context.newCDPSession(anchorPage);
  const { targetInfo } = await anchorSession.send('Target.getTargetInfo');
  const browserSession = await browser.newBrowserCDPSession();
  const pagePromise = extension.context.waitForEvent('page', { timeout: 10_000 });

  try {
    const created = await browserSession.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: targetInfo.browserContextId,
      forTab: true,
    });
    const page = await pagePromise;
    rooTabTargetIds.set(page, created.targetId);
    return page;
  } finally {
    await browserSession.detach().catch(() => undefined);
    await anchorSession.detach().catch(() => undefined);
  }
}

export interface RooTestWindow {
  page: Page;
  windowId: number;
}

export async function openRooTestWindow(extension: RooExtension): Promise<RooTestWindow> {
  const browser = extension.context.browser();
  const anchorPage = extension.context.pages()[0];

  if (!browser || !anchorPage) {
    throw new Error('The Roo E2E context did not expose a browser tab.');
  }

  const anchorSession = await extension.context.newCDPSession(anchorPage);
  const { targetInfo: anchorTargetInfo } = await anchorSession.send('Target.getTargetInfo');
  const browserSession = await browser.newBrowserCDPSession();
  const pagePromise = extension.context.waitForEvent('page', { timeout: 10_000 });

  try {
    const { windowId: anchorWindowId } = await browserSession.send('Browser.getWindowForTarget', {
      targetId: anchorTargetInfo.targetId,
    });
    const created = await browserSession.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: anchorTargetInfo.browserContextId,
      forTab: true,
      newWindow: true,
    });
    const page = await pagePromise;
    rooTabTargetIds.set(page, created.targetId);
    const { windowId } = await browserSession.send('Browser.getWindowForTarget', {
      targetId: created.targetId,
    });

    if (windowId === anchorWindowId) {
      throw new Error('The Chromium target was not created in a second browser window.');
    }

    await page.bringToFront();
    return { page, windowId };
  } finally {
    await browserSession.detach().catch(() => undefined);
    await anchorSession.detach().catch(() => undefined);
  }
}

export async function isRooActionEnabledForPage(
  extension: RooExtension,
  targetPage: Page,
): Promise<boolean> {
  const browser = extension.context.browser();
  const targetId = rooTabTargetIds.get(targetPage);

  if (!browser || !targetId) {
    throw new Error('The supplied AWS page is not backed by a Roo E2E tab target.');
  }

  await targetPage.bringToFront();
  const browserSession = await browser.newBrowserCDPSession();
  let windowId: number;

  try {
    await browserSession.send('Target.activateTarget', { targetId });
    ({ windowId } = await browserSession.send('Browser.getWindowForTarget', { targetId }));
  } finally {
    await browserSession.detach().catch(() => undefined);
  }

  return extension.serviceWorker.evaluate(async (targetWindowId) => {
    const tabs = await chrome.tabs.query({ active: true, windowId: targetWindowId });
    const tabId = tabs[0]?.id;

    if (typeof tabId !== 'number') {
      throw new Error('The active Roo E2E tab did not have a numeric ID.');
    }

    return chrome.action.isEnabled(tabId);
  }, windowId);
}

export async function openRooActionPopupForPage(
  extension: RooExtension,
  targetPage: Page,
): Promise<Page> {
  await expect.poll(() => isRooActionEnabledForPage(extension, targetPage)).toBe(true);
  const actionResult = await triggerRooActionForPage(extension, targetPage, { timeoutMs: 10_000 });

  if (actionResult.status === 'protocol-rejected') {
    throw new Error(`The real extension action was rejected by Chromium: ${actionResult.message}`);
  }

  if (!actionResult.popupAppeared) {
    throw new Error(`The real extension action did not create ${extension.extensionUrl}/popup.html.`);
  }

  return attachRooActionPopupForPage(extension, targetPage);
}

export async function attachRooActionPopupForPage(
  extension: RooExtension,
  targetPage: Page,
): Promise<Page> {
  const popupUrl = `${extension.extensionUrl}/popup.html`;
  await extension.debugBrowser.close().catch(() => undefined);
  extension.debugBrowser = await chromium.connectOverCDP(extension.debugEndpoint);
  const debugContext = extension.debugBrowser.contexts()[0];
  let popupPage: Page | undefined;
  await expect.poll(() => {
    popupPage = debugContext?.pages().find((page) => page.url() === popupUrl);
    return popupPage !== undefined;
  }).toBe(true);

  if (!popupPage) {
    throw new Error(`The real extension action popup page ${popupUrl} was not exposed by Chromium.`);
  }

  await targetPage.bringToFront();
  extension.watchExtensionPage(popupPage);
  await expect(popupPage.getByLabel('Search AWS destinations')).toBeVisible();
  await expect.poll(() => popupPage?.locator('body').innerText() ?? '').not.toContain('Loading…');

  return popupPage;
}

export async function triggerRooActionForPage(
  extension: RooExtension,
  targetPage: Page,
  options: { timeoutMs?: number } = {},
): Promise<RooActionTriggerResult> {
  const browser = extension.context.browser();

  if (!browser) {
    throw new Error('The Roo E2E context is not attached to a Chromium browser.');
  }

  await targetPage.bringToFront();
  const targetSession = await extension.context.newCDPSession(targetPage);
  const { targetInfo: pageTargetInfo } = await targetSession.send('Target.getTargetInfo');
  const browserSession = await browser.newBrowserCDPSession();

  try {
    const targetId = rooTabTargetIds.get(targetPage);

    if (!targetId) {
      throw new Error('The supplied AWS page is not backed by a Roo E2E tab target.');
    }

    const { targetInfo } = await browserSession.send('Target.getTargetInfo', { targetId });

    if (
      targetInfo.targetId !== targetId ||
      targetInfo.type !== 'tab' ||
      targetInfo.browserContextId !== pageTargetInfo.browserContextId
    ) {
      throw new Error('The supplied AWS page tab target could not be verified.');
    }

    const popupUrl = `${extension.extensionUrl}/popup.html`;
    const { targetInfos } = await browserSession.send('Target.getTargets');
    const existingPopupTargetIds = new Set(
      targetInfos
        .filter((target) => target.url === popupUrl)
        .map((target) => target.targetId),
    );

    await browserSession.send('Target.activateTarget', { targetId });
    try {
      await browserSession.send('Extensions.triggerAction', {
        id: new URL(extension.serviceWorker.url()).host,
        targetId,
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = rawMessage.trim().length > 0
        ? rawMessage
        : 'Chromium rejected Extensions.triggerAction.';
      await browserSession.send('Target.getTargets');
      const popupTargetId = await waitForNewTargetUrl(
        browserSession,
        popupUrl,
        existingPopupTargetIds,
        options.timeoutMs ?? 2_000,
      );

      if (popupTargetId !== undefined) {
        throw new Error(
          `Chromium rejected Extensions.triggerAction but created ${popupUrl}.`,
        );
      }

      return {
        status: 'protocol-rejected',
        popupAppeared: false,
        message,
      };
    }

    await targetPage.bringToFront();
    const popupTargetId = await waitForNewTargetUrl(
      browserSession,
      popupUrl,
      existingPopupTargetIds,
      options.timeoutMs ?? 2_000,
    );
    await targetPage.bringToFront();
    return {
      status: 'triggered',
      popupAppeared: popupTargetId !== undefined,
    };
  } finally {
    await browserSession.detach().catch(() => undefined);
    await targetSession.detach().catch(() => undefined);
  }
}
