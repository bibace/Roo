import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAwsConsolePageSnapshot } from './page-snapshot';

type PageElement = {
  textContent?: string | null;
  getAttribute?: (name: string) => string | null;
};

function installPage(options: {
  consoleNav?: {
    loginDisplayNameAccount?: unknown;
    roleDisplayNameAccount?: unknown;
    [key: string]: unknown;
  };
  loginDom?: string | null;
  roleDom?: string | null;
  sessionData?: string | null;
} = {}) {
  const consoleNav = options.consoleNav === undefined
    ? undefined
    : { AccountInfo: options.consoleNav };
  const elements: Record<string, PageElement | null> = {
    '#awsc-login-display-name-account': options.loginDom === undefined
      ? null
      : { textContent: options.loginDom },
    '#awsc-role-display-name-account': options.roleDom === undefined
      ? null
      : { textContent: options.roleDom },
    'meta[name="awsc-session-data"]': options.sessionData === undefined
      ? null
      : { getAttribute: () => options.sessionData ?? null },
  };
  const pageDocument = {
    querySelector: vi.fn((selector: string) => elements[selector] ?? null),
  };

  Object.defineProperty(pageDocument, 'cookie', {
    configurable: true,
    get() {
      throw new Error('document.cookie must not be read');
    },
  });
  vi.stubGlobal('document', pageDocument);

  if (consoleNav !== undefined) {
    vi.stubGlobal('ConsoleNavService', consoleNav);
  }

  return pageDocument;
}

function installThrowingStorageAccessors() {
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        throw new Error(`${name} must not be read`);
      },
    });
  }
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  vi.unstubAllGlobals();
});

describe('readAwsConsolePageSnapshot', () => {
  it('uses only the two identity sources and the Prism boolean', () => {
    const pageDocument = installPage({
      consoleNav: {
        loginDisplayNameAccount: '  123456789012  ',
        roleDisplayNameAccount: '  company-prod  ',
        token: 'token-like-value',
        credential: 'credential-like-value',
      },
      loginDom: 'dom-login-value',
      roleDom: 'dom-role-value',
      sessionData: JSON.stringify({
        prismModeEnabled: true,
        csrf: 'csrf-like-value',
        cookie: 'cookie-like-value',
        accessKeyId: 'access-key-like-value',
        secretAccessKey: 'secret-key-like-value',
        unrelatedMetadata: 'must-not-escape',
      }),
    });

    expect(readAwsConsolePageSnapshot()).toEqual({
      loginDisplayNameAccount: '123456789012',
      roleDisplayNameAccount: 'company-prod',
      multiSession: true,
      source: 'console-nav',
    });
    expect(pageDocument.querySelector.mock.calls.map(([selector]) => selector)).toEqual([
      '#awsc-login-display-name-account',
      '#awsc-role-display-name-account',
      'meta[name="awsc-session-data"]',
    ]);
  });

  it('trims page-side identity values before returning them', () => {
    installPage({
      loginDom: '  1234-5678-9012  ',
      roleDom: '\tcompany-prod\n',
    });

    expect(readAwsConsolePageSnapshot()).toEqual({
      loginDisplayNameAccount: '1234-5678-9012',
      roleDisplayNameAccount: 'company-prod',
      multiSession: false,
      source: 'dom',
    });
  });

  it('returns null for empty or overlong identity values', () => {
    installPage({
      consoleNav: {
        loginDisplayNameAccount: ` ${'a'.repeat(63)} `,
        roleDisplayNameAccount: ' '.repeat(64),
      },
      loginDom: 'b'.repeat(64),
      roleDom: 'role-value',
    });

    expect(readAwsConsolePageSnapshot()).toEqual({
      loginDisplayNameAccount: 'a'.repeat(63),
      roleDisplayNameAccount: 'role-value',
      multiSession: false,
      source: 'console-nav',
    });

    installPage({
      consoleNav: {
        loginDisplayNameAccount: 'a'.repeat(64),
        roleDisplayNameAccount: 'b'.repeat(64),
      },
    });

    expect(readAwsConsolePageSnapshot()).toEqual({
      loginDisplayNameAccount: null,
      roleDisplayNameAccount: null,
      multiSession: false,
      source: 'dom',
    });
  });

  it('does not touch cookie or storage surfaces', () => {
    installPage({
      loginDom: '123456789012',
      sessionData: JSON.stringify({ prismModeEnabled: false }),
    });
    installThrowingStorageAccessors();

    expect(() => readAwsConsolePageSnapshot()).not.toThrow();
  });

  it('treats malformed awsc-session-data as non-fatal Legacy mode', () => {
    installPage({
      loginDom: '123456789012',
      sessionData: '{malformed',
    });

    expect(readAwsConsolePageSnapshot()).toEqual({
      loginDisplayNameAccount: '123456789012',
      roleDisplayNameAccount: null,
      multiSession: false,
      source: 'dom',
    });
  });
});
