import { test as base, expect, type Page } from '@playwright/test';
import {
  closeRooExtension,
  launchRooExtension,
  openRooTestWindow,
  openRooTestTab,
  type RooExtension,
} from './fixtures';
import {
  parseAwsTabContextResponse,
  type AwsTabContextResponse,
} from '../src/aws-context/tab-context-protocol';
import type { AwsConsoleContextResult } from '../src/aws-context/types';

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

const awsFixtureUrl = 'https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1';
const queryPages = new WeakMap<RooExtension, Page>();

async function prepareContextQueryPage(roo: RooExtension): Promise<Page> {
  let queryPage = queryPages.get(roo);
  if (queryPage === undefined) {
    queryPage = await roo.context.newPage();
    queryPages.set(roo, queryPage);
  }
  if (!queryPage.url().startsWith(roo.extensionUrl)) {
    await queryPage.goto(`${roo.extensionUrl}/options.html`);
  }

  return queryPage;
}

async function queryActiveContext(
  roo: RooExtension,
  activePage: Page,
): Promise<AwsTabContextResponse> {
  await activePage.bringToFront();

  const queryPage = await prepareContextQueryPage(roo);
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
}

type ReadyAwsTabContextResponse = {
  ok: true;
  probe: {
    tabId: number;
    result: Extract<AwsConsoleContextResult, { status: 'ready' }>;
  };
};

function requireReady(response: AwsTabContextResponse): ReadyAwsTabContextResponse {
  if (!response.ok || response.probe.result.status !== 'ready') {
    throw new Error('The active AWS tab did not have ready context.');
  }

  return response as ReadyAwsTabContextResponse;
}

async function waitForReady(
  roo: RooExtension,
  activePage: Page,
): Promise<ReturnType<typeof requireReady>> {
  let latest: AwsTabContextResponse | undefined;

  await expect.poll(async () => {
    latest = await queryActiveContext(roo, activePage);
    return latest.ok && latest.probe.result.status === 'ready';
  }).toBe(true);

  return requireReady(latest as AwsTabContextResponse);
}

async function openAwsFixture(
  roo: RooExtension,
  snapshot: { login: string; current: string },
  existingPage?: Page,
): Promise<Page> {
  const page = existingPage ?? await openRooTestTab(roo);

  await page.route('**/*', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>AWS Context Fixture</title><main>AWS Context Fixture</main>',
  }));
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
  await page.goto(awsFixtureUrl);
  await page.bringToFront();
  return page;
}

test('AWS page automatically establishes context without opening the Popup', async ({ roo }) => {
  const page = await openAwsFixture(roo, { login: '111111111111', current: '222222222222' });

  const response = await waitForReady(roo, page);

  expect(response.probe.tabId).toBeGreaterThan(0);
  expect(response.probe.result.context).toEqual({
    loginAccountIdOrAlias: '111111111111',
    currentAccountIdOrAlias: '222222222222',
    multiSession: false,
    source: 'console-nav',
  });
});

test('repeated AWS context reads return the same ready context', async ({ roo }) => {
  const page = await openAwsFixture(roo, { login: '111111111111', current: '222222222222' });

  const first = await waitForReady(roo, page);
  const second = requireReady(await queryActiveContext(roo, page));

  expect(second).toEqual(first);
});

test('AWS lifecycle refresh updates the same tab exactly once for a semantic change', async ({ roo }) => {
  const page = await openAwsFixture(roo, { login: '111111111111', current: '222222222222' });
  const first = await waitForReady(roo, page);

  await page.evaluate(() => {
    const pageGlobal = globalThis as typeof globalThis & {
      ConsoleNavService: {
        AccountInfo: {
          loginDisplayNameAccount: string;
          roleDisplayNameAccount: string;
        };
      };
    };
    pageGlobal.ConsoleNavService.AccountInfo.roleDisplayNameAccount = '333333333333';
    window.dispatchEvent(new Event('focus'));
  });

  let latest: AwsTabContextResponse | undefined;
  await expect.poll(async () => {
    latest = await queryActiveContext(roo, page);
    return latest.ok && latest.probe.result.status === 'ready'
      ? latest.probe.result.context.currentAccountIdOrAlias
      : undefined;
  }).toBe('333333333333');

  const second = requireReady(latest as AwsTabContextResponse);
  expect(second.probe.tabId).toBe(first.probe.tabId);
  expect(second.probe.result.context).not.toEqual(first.probe.result.context);
});

test('same-document unavailable refresh retains last-ready context until loading invalidates it', async ({ roo }) => {
  const page = await openAwsFixture(roo, { login: '111111111111', current: '222222222222' });
  const previous = await waitForReady(roo, page);

  await page.evaluate(() => {
    const pageGlobal = globalThis as typeof globalThis & { ConsoleNavService?: unknown };
    delete pageGlobal.ConsoleNavService;
    window.dispatchEvent(new Event('focus'));
  });

  const retained = requireReady(await queryActiveContext(roo, page));
  expect(retained.probe.result.context).toEqual(previous.probe.result.context);

  await page.addInitScript(() => {
    const pageGlobal = globalThis as typeof globalThis & { ConsoleNavService?: unknown };
    delete pageGlobal.ConsoleNavService;
  });
  await page.goto(awsFixtureUrl);
  await page.bringToFront();

  let latest: AwsTabContextResponse | undefined;
  await expect.poll(async () => {
    latest = await queryActiveContext(roo, page);
    return latest.ok ? latest.probe.result.status : undefined;
  }).toBe('unavailable');

  expect(latest).toEqual({
    ok: true,
    probe: {
      tabId: previous.probe.tabId,
      result: { status: 'unavailable' },
    },
  });
});

test('two AWS tabs retain independent context associations', async ({ roo }) => {
  const tabA = await openAwsFixture(roo, { login: '111111111111', current: '111111111113' });
  const tabB = await openAwsFixture(roo, { login: '222222222222', current: '222222222223' });

  await tabA.bringToFront();
  const contextA = await waitForReady(roo, tabA);

  await tabB.bringToFront();
  const contextB = await waitForReady(roo, tabB);

  await tabA.bringToFront();
  const contextAAgain = requireReady(await queryActiveContext(roo, tabA));

  expect(contextA.probe.tabId).not.toBe(contextB.probe.tabId);
  expect(contextA.probe.result.context.loginAccountIdOrAlias).toBe('111111111111');
  expect(contextB.probe.result.context.loginAccountIdOrAlias).toBe('222222222222');
  expect(contextAAgain).toEqual(contextA);
});

test('active AWS context follows the last-focused real browser window', async ({ roo }) => {
  await prepareContextQueryPage(roo);
  const windowA = await openRooTestWindow(roo);
  const pageA = await openAwsFixture(
    roo,
    { login: '111111111111', current: '111111111113' },
    windowA.page,
  );

  const contextA = await waitForReady(roo, pageA);
  expect(contextA.probe.result.context).toMatchObject({
    loginAccountIdOrAlias: '111111111111',
    currentAccountIdOrAlias: '111111111113',
  });

  const windowB = await openRooTestWindow(roo);
  const pageB = await openAwsFixture(
    roo,
    { login: '222222222222', current: '222222222223' },
    windowB.page,
  );

  expect(windowB.windowId).not.toBe(windowA.windowId);

  const contextB = await waitForReady(roo, pageB);
  expect(contextB.probe.result.context).toMatchObject({
    loginAccountIdOrAlias: '222222222222',
    currentAccountIdOrAlias: '222222222223',
  });

  expect(contextA.probe.tabId).not.toBe(contextB.probe.tabId);
  expect(contextA.probe.result.context.loginAccountIdOrAlias).not.toBe(
    contextB.probe.result.context.loginAccountIdOrAlias,
  );
  expect(contextA.probe.result.context.currentAccountIdOrAlias).not.toBe(
    contextB.probe.result.context.currentAccountIdOrAlias,
  );
});

test('navigation away clears stale AWS context and a later AWS page establishes a new record', async ({ roo }) => {
  const page = await openAwsFixture(roo, { login: '111111111111', current: '111111111113' });
  const previous = await waitForReady(roo, page);

  await page.goto('https://example.com/fixture');
  await page.bringToFront();
  await expect.poll(async () => {
    const response = await queryActiveContext(roo, page);
    return response.ok && response.probe.result.status === 'not-aws-console';
  }).toBe(true);

  const away = await queryActiveContext(roo, page);
  expect(away).toEqual({
    ok: true,
    probe: {
      tabId: previous.probe.tabId,
      result: { status: 'not-aws-console' },
    },
  });

  await page.addInitScript(() => {
    const pageGlobal = globalThis as typeof globalThis & {
      ConsoleNavService: {
        AccountInfo: {
          loginDisplayNameAccount: string;
          roleDisplayNameAccount: string;
        };
      };
    };
    pageGlobal.ConsoleNavService = {
      AccountInfo: {
        loginDisplayNameAccount: '444444444444',
        roleDisplayNameAccount: '555555555555',
      },
    };
  });
  await page.goto(awsFixtureUrl);
  await page.bringToFront();

  let latest: AwsTabContextResponse | undefined;
  await expect.poll(async () => {
    latest = await queryActiveContext(roo, page);
    return latest.ok && latest.probe.result.status === 'ready'
      ? latest.probe.result.context.loginAccountIdOrAlias
      : undefined;
  }).toBe('444444444444');

  const replacement = requireReady(latest as AwsTabContextResponse);
  expect(replacement.probe.tabId).toBe(previous.probe.tabId);
  expect(replacement.probe.result.context.currentAccountIdOrAlias).toBe('555555555555');
  expect(replacement.probe.result.context.loginAccountIdOrAlias).not.toBe(
    previous.probe.result.context.loginAccountIdOrAlias,
  );
});
