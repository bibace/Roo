import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  getAwsConsoleContextProbeForTab,
} from '../src/aws-context/get-aws-console-context';
import { getRooActionStateForUrl } from '../src/aws-context/action-state';
import { WorkspaceOperationError } from '../src/workspace/errors';
import {
  parseWorkspaceRequest,
  type WorkspaceResponse,
} from '../src/workspace/protocol';
import { WorkspaceCoordinator } from '../src/workspace/coordinator';
import { isSupportedAwsConsoleUrl } from '../src/aws-context/supported-url';
import {
  AwsTabContextStore,
  type AwsTabContextRecord,
} from '../src/aws-context/tab-context-store';
import {
  parseAwsTabContextRequest,
  type AwsTabContextResponse,
} from '../src/aws-context/tab-context-protocol';
import type { AwsConsoleContextProbe } from '../src/aws-context/types';
import {
  parsePopupBootstrapRequest,
  type PopupBootstrapResponse,
} from '../src/popup/bootstrap-protocol';
import { getPopupBootstrap } from '../src/popup/popup-bootstrap-service';
import { hasRelevantWorkspaceStorageChange } from '../src/workspace/storage-change';

interface RooActionApi {
  enable(tabId?: number): Promise<void>;
  disable(tabId?: number): Promise<void>;
}

const coordinator = new WorkspaceCoordinator();
const tabContextStore = new AwsTabContextStore();
const rooAction = (
  import.meta.env.MANIFEST_VERSION === 2
    ? browser.browserAction
    : browser.action
) as unknown as RooActionApi;

const tabUnavailableResponse: AwsTabContextResponse = {
  ok: false,
  error: {
    code: 'TAB_UNAVAILABLE',
    message: 'AWS tab context is unavailable.',
  },
};

function isUsableTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

async function enableRooAction(tabId: number): Promise<void> {
  try {
    await rooAction.enable(tabId);
  } catch {
    // Action state is best effort and must not interrupt background lifecycle handling.
  }
}

async function disableRooAction(tabId?: number): Promise<void> {
  try {
    if (tabId === undefined) {
      await rooAction.disable();
    } else {
      await rooAction.disable(tabId);
    }
  } catch {
    // Action state is best effort and must not interrupt background lifecycle handling.
  }
}

function getActionTab(tab: unknown): { id: number; url: string | undefined } | undefined {
  if (typeof tab !== 'object' || tab === null) {
    return undefined;
  }

  const candidate = tab as { id?: unknown; url?: unknown };
  return isUsableTabId(candidate.id)
    ? {
        id: candidate.id,
        url: typeof candidate.url === 'string' ? candidate.url : undefined,
      }
    : undefined;
}

async function reconcileRooActionForUrl(
  tabId: number,
  url: string | undefined,
): Promise<void> {
  if (getRooActionStateForUrl(url) === 'enabled') {
    await enableRooAction(tabId);
  } else {
    await disableRooAction(tabId);
  }
}

async function reconcileRooActionForTab(tab: unknown): Promise<void> {
  const actionTab = getActionTab(tab);

  if (actionTab === undefined) {
    return;
  }

  await reconcileRooActionForUrl(actionTab.id, actionTab.url);
}

async function initializeRooActionState(): Promise<void> {
  await disableRooAction();

  let tabs: unknown;

  try {
    tabs = await browser.tabs.query({});
  } catch {
    return;
  }

  if (!Array.isArray(tabs)) {
    return;
  }

  await Promise.all(tabs.map((tab) => reconcileRooActionForTab(tab)));
}

async function reconcileReplacedTab(tabId: number): Promise<void> {
  await disableRooAction(tabId);

  try {
    const tab = await browser.tabs.get(tabId);
    await reconcileRooActionForTab(tab);
  } catch {
    // A failed replacement lookup leaves the added tab disabled.
  }
}

function successResponse(probe: AwsConsoleContextProbe): AwsTabContextResponse {
  return { ok: true, probe };
}

function probeForRecord(record: AwsTabContextRecord): AwsConsoleContextProbe {
  return {
    tabId: record.tabId,
    result: { status: 'ready', context: record.context },
  };
}

function noActiveTabProbe(): AwsConsoleContextProbe {
  return { tabId: null, result: { status: 'unavailable' } };
}

function notAwsConsoleProbe(tabId: number): AwsConsoleContextProbe {
  return { tabId, result: { status: 'not-aws-console' } };
}

async function refreshAwsTabContext(tabId: number, url: string): Promise<AwsConsoleContextProbe> {
  const generation = tabContextStore.beginRefresh(tabId);
  const probe = await getAwsConsoleContextProbeForTab(tabId, url);
  const effectiveResult = tabContextStore.completeRefresh(tabId, generation, probe.result);

  if (effectiveResult.status === 'ready') {
    void coordinator.warmWorkspaceCache().catch(() => undefined);
  }

  return { tabId, result: effectiveResult };
}

async function handleRefreshRequest(
  sender: Parameters<Parameters<typeof browser.runtime.onMessage.addListener>[0]>[1],
): Promise<AwsTabContextResponse> {
  const tab = sender.tab;

  if (
    tab === undefined ||
    !isUsableTabId(tab.id) ||
    typeof tab.url !== 'string' ||
    !isSupportedAwsConsoleUrl(tab.url)
  ) {
    return tabUnavailableResponse;
  }

  const probe = await refreshAwsTabContext(tab.id, tab.url);
  await reconcileRooActionForUrl(tab.id, tab.url);
  return successResponse(probe);
}

async function getActiveAwsTabContextProbeInBackground(): Promise<AwsConsoleContextProbe> {
  let tabs: unknown;

  try {
    tabs = await browser.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });

    if (!Array.isArray(tabs) || tabs.length !== 1) {
      tabs = await browser.tabs.query({ active: true });
    }
  } catch {
    return noActiveTabProbe();
  }

  if (!Array.isArray(tabs) || tabs.length !== 1) {
    return noActiveTabProbe();
  }

  const [activeTab] = tabs;

  if (typeof activeTab !== 'object' || activeTab === null) {
    return noActiveTabProbe();
  }

  const rawTabId = (activeTab as { id?: unknown }).id;

  if (!isUsableTabId(rawTabId)) {
    return noActiveTabProbe();
  }

  const tabId = rawTabId;
  const url = typeof (activeTab as { url?: unknown }).url === 'string'
    ? (activeTab as { url: string }).url
    : undefined;

  if (url !== undefined && !isSupportedAwsConsoleUrl(url)) {
    tabContextStore.invalidate(tabId);
    await reconcileRooActionForUrl(tabId, url);
    return notAwsConsoleProbe(tabId);
  }

  if (url === undefined) {
    await reconcileRooActionForUrl(tabId, url);
    return notAwsConsoleProbe(tabId);
  }

  await reconcileRooActionForUrl(tabId, url);

  const cached = tabContextStore.get(tabId);

  if (cached !== undefined) {
    return probeForRecord(cached);
  }

  return refreshAwsTabContext(tabId, url);
}

async function handleActiveTabQuery(): Promise<AwsTabContextResponse> {
  return successResponse(await getActiveAwsTabContextProbeInBackground());
}

async function handleAwsTabContextRequest(
  request: NonNullable<ReturnType<typeof parseAwsTabContextRequest>>,
  sender: Parameters<Parameters<typeof browser.runtime.onMessage.addListener>[0]>[1],
): Promise<AwsTabContextResponse> {
  if (request.type === 'AWS_TAB_CONTEXT_REFRESH') {
    return handleRefreshRequest(sender);
  }

  return handleActiveTabQuery();
}

function errorResponse(error: unknown): WorkspaceResponse {
  if (error instanceof WorkspaceOperationError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message },
    };
  }

  return {
    ok: false,
    error: {
      code: 'STORAGE_FAILED',
      message: 'Unable to complete Roo workspace operation.',
    },
  };
}

export default defineBackground(() => {
  void initializeRooActionState().catch(() => undefined);

  browser.storage.onChanged.addListener((changes) => {
    if (hasRelevantWorkspaceStorageChange(changes)) {
      coordinator.invalidateWorkspaceCache();
    }
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const awsTabContextRequest = parseAwsTabContextRequest(message);

    if (awsTabContextRequest) {
      void handleAwsTabContextRequest(awsTabContextRequest, sender).then(
        (response) => {
          try {
            sendResponse(response);
          } catch {
            // The sender may have gone away while the tab was tearing down.
          }
        },
        () => {
          try {
            sendResponse(tabUnavailableResponse);
          } catch {
            // The sender may have gone away while the tab was tearing down.
          }
        },
      ).catch(() => undefined);
      return true;
    }

    const popupBootstrapRequest = parsePopupBootstrapRequest(message);

    if (popupBootstrapRequest) {
      void getPopupBootstrap({
        getWorkspace: () => coordinator.handle({ type: 'GET_WORKSPACE' }),
        getActiveAwsTabContextProbe: getActiveAwsTabContextProbeInBackground,
      }).then(
        (bootstrap) => sendResponse({ ok: true, bootstrap } satisfies PopupBootstrapResponse),
        () => sendResponse({
          ok: false,
          error: { message: 'Unable to load Roo popup.' },
        } satisfies PopupBootstrapResponse),
      );

      return true;
    }

    const request = parseWorkspaceRequest(message);

    if (!request) {
      sendResponse({
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid Roo workspace request.' },
      } satisfies WorkspaceResponse);
      return;
    }

    void coordinator.handle(request).then(
      (workspace) => sendResponse({ ok: true, workspace } satisfies WorkspaceResponse),
      (error) => sendResponse(errorResponse(error)),
    );

    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    tabContextStore.remove(tabId);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url === undefined && changeInfo.status === undefined) {
      return;
    }

    const effectiveUrl = typeof changeInfo.url === 'string'
      ? changeInfo.url
      : typeof tab.url === 'string'
        ? tab.url
        : undefined;

    if (changeInfo.status === 'loading') {
      tabContextStore.invalidate(tabId);
    }

    void reconcileRooActionForUrl(tabId, effectiveUrl);
  });

  browser.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    tabContextStore.remove(removedTabId);
    void reconcileReplacedTab(addedTabId);
  });
});
