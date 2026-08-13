import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AwsSwitchRoleRequest } from './build-aws-switch-role-request';
import { submitAwsSwitchRoleInPage } from './submit-aws-switch-role';

const fetchMock = vi.fn();
const locationAssign = vi.fn();

const request: AwsSwitchRoleRequest = {
  endpoint: 'https://signin.aws.amazon.com/switchrole',
  account: '111111111111',
  roleName: 'platform/security-readonly',
  displayName: 'atlas-prod | 111111111111',
};

function sessionData(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    prismModeEnabled: true,
    signInEndpoint: 'signin.aws.amazon.com',
    sessionDifferentiator: '000000000000-aaaaaaaa',
    ...overrides,
  });
}

function installPage(options: {
  sessionData?: string | null;
  fallbackSigninEndpoint?: string | null;
  body?: boolean;
  href?: string;
} = {}) {
  const sessionElement = options.sessionData === undefined
    ? null
    : { getAttribute: () => options.sessionData ?? null };
  const signinEndpointElement = options.fallbackSigninEndpoint === undefined
    ? null
    : { getAttribute: () => options.fallbackSigninEndpoint ?? null };
  const body = options.body === false ? null : { append: vi.fn() };
  const form = {
    append: vi.fn(),
    method: '',
    action: '',
    target: '',
    style: { display: '' },
    submit: vi.fn(),
  };
  const setTimeoutMock = vi.fn();

  vi.stubGlobal('document', {
    body,
    createElement: vi.fn((tagName: string) => tagName === 'form'
      ? form
      : { type: '', name: '', value: '' }),
    querySelector: vi.fn((selector: string) => {
      if (selector === 'meta[name="awsc-session-data"]') {
        return sessionElement;
      }

      if (selector === '#awsc-signin-endpoint') {
        return signinEndpointElement;
      }

      return null;
    }),
  });
  vi.stubGlobal('location', {
    href: options.href ??
      'https://000000000000-aaaaaaaa.us-east-1.console.aws.amazon.com/console/home?region=us-east-1#current',
    assign: locationAssign,
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('setTimeout', setTimeoutMock);

  return { body, form, setTimeoutMock };
}

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('submitAwsSwitchRoleInPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    locationAssign.mockReset();
    fetchMock.mockResolvedValue(response({
      destination: 'https://999999999999-bbbbbbbb.us-east-1.console.aws.amazon.com/console/home?region=us-east-1',
    }));
  });

  it('removes only the current session hostname prefix from the Prism redirect URI', async () => {
    installPage({ sessionData: sessionData() });

    await expect(submitAwsSwitchRoleInPage(request)).resolves.toEqual({
      status: 'submitted',
      mode: 'prism',
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      account: request.account,
      color: 'aaaaaa',
      displayName: request.displayName,
      redirectUri: 'https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1#current',
      roleName: request.roleName,
    });
  });

  it('does not remove the session differentiator from path, query, or hash', async () => {
    installPage({
      sessionData: sessionData(),
      href: 'https://us-east-1.console.aws.amazon.com/console/000000000000-aaaaaaaa?session=000000000000-aaaaaaaa#000000000000-aaaaaaaa',
    });

    await submitAwsSwitchRoleInPage(request);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body)).redirectUri).toBe(
      'https://us-east-1.console.aws.amazon.com/console/000000000000-aaaaaaaa?session=000000000000-aaaaaaaa#000000000000-aaaaaaaa',
    );
  });

  it.each([
    'signin.aws.amazon.com',
    'tenant.signin.aws.amazon.com',
    'https://signin.aws.amazon.com',
    'https://tenant.signin.aws.amazon.com/',
  ])('accepts the commercial sign-in endpoint form %s', async (signInEndpoint) => {
    installPage({ sessionData: sessionData({ signInEndpoint }) });

    await expect(submitAwsSwitchRoleInPage(request)).resolves.toMatchObject({ status: 'submitted' });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/sessions/000000000000-aaaaaaaa/v1/switchrole');
  });

  it('uses the fallback sign-in endpoint only when metadata omits it', async () => {
    installPage({
      sessionData: sessionData({ signInEndpoint: undefined }),
      fallbackSigninEndpoint: 'tenant.signin.aws.amazon.com',
    });

    await submitAwsSwitchRoleInPage(request);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://tenant.signin.aws.amazon.com/sessions/000000000000-aaaaaaaa/v1/switchrole',
    );
  });

  it('rejects an explicitly invalid metadata sign-in endpoint without fallback', async () => {
    installPage({
      sessionData: sessionData({ signInEndpoint: 'https://signin.amazonaws.com' }),
      fallbackSigninEndpoint: 'signin.aws.amazon.com',
    });

    await expect(submitAwsSwitchRoleInPage(request)).resolves.toEqual({
      status: 'unavailable',
      reason: 'SIGNIN_ENDPOINT_INVALID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{', 'SESSION_METADATA_INVALID'],
    ['malformed object', '[]', 'SESSION_METADATA_INVALID'],
    ['missing session', sessionData({ sessionDifferentiator: '' }), 'PRISM_SESSION_MISSING'],
  ] as const)('returns the exact failure code for %s', async (_label, content, reason) => {
    installPage({ sessionData: content });

    await expect(submitAwsSwitchRoleInPage(request)).resolves.toEqual({
      status: 'unavailable',
      reason,
    });
  });

  it('accepts the string Prism mode representation', async () => {
    installPage({ sessionData: sessionData({ prismModeEnabled: 'true' }) });

    await expect(submitAwsSwitchRoleInPage(request)).resolves.toMatchObject({
      status: 'submitted',
      mode: 'prism',
    });
  });

  it.each([
    ['request failure', () => fetchMock.mockRejectedValue(new Error('network')), 'PRISM_REQUEST_FAILED'],
    ['HTTP failure', () => fetchMock.mockResolvedValue(response({}, false)), 'PRISM_HTTP_FAILED'],
    ['response parse failure', () => fetchMock.mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new Error('bad JSON')) }), 'PRISM_RESPONSE_INVALID'],
    ['missing destination', () => fetchMock.mockResolvedValue(response({})), 'PRISM_RESPONSE_INVALID'],
    ['invalid destination', () => fetchMock.mockResolvedValue(response({ destination: 'https://example.com' })), 'PRISM_DESTINATION_INVALID'],
  ] as const)('returns %s without exposing exception details', async (_label, configure, reason) => {
    installPage({ sessionData: sessionData() });
    configure();

    await expect(submitAwsSwitchRoleInPage(request)).resolves.toEqual({
      status: 'unavailable',
      reason,
    });
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it('returns INVALID_REQUEST for an invalid request', async () => {
    installPage({ sessionData: sessionData() });

    await expect(submitAwsSwitchRoleInPage({ ...request, account: 'not-an-account' })).resolves.toEqual({
      status: 'unavailable',
      reason: 'INVALID_REQUEST',
    });
  });

  it('accepts a finite numeric legacy CSRF value and serializes it into the form', async () => {
    const { form, setTimeoutMock } = installPage({
      sessionData: JSON.stringify({ prismModeEnabled: false }),
    });
    vi.stubGlobal('AWSC', { Auth: { getMbtc: () => 1234567890 } });

    await expect(submitAwsSwitchRoleInPage(request)).resolves.toEqual({
      status: 'submitted',
      mode: 'legacy',
    });

    const callback = setTimeoutMock.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(callback).toBeTypeOf('function');
    callback?.();

    const csrfInput = form.append.mock.calls
      .map(([input]) => input as { name: string; value: string })
      .find((input) => input.name === 'csrf');
    expect(csrfInput).toEqual({
      type: 'hidden',
      name: 'csrf',
      value: '1234567890',
    });
    expect(typeof csrfInput?.value).toBe('string');
  });

  it('accepts a non-empty string legacy CSRF value unchanged', async () => {
    const { form, setTimeoutMock } = installPage({
      sessionData: JSON.stringify({ prismModeEnabled: false }),
    });
    vi.stubGlobal('AWSC', { Auth: { getMbtc: () => 'legacy-string-csrf' } });

    await expect(submitAwsSwitchRoleInPage(request)).resolves.toEqual({
      status: 'submitted',
      mode: 'legacy',
    });

    const callback = setTimeoutMock.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(callback).toBeTypeOf('function');
    callback?.();

    const csrfInput = form.append.mock.calls
      .map(([input]) => input as { name: string; value: string })
      .find((input) => input.name === 'csrf');
    expect(csrfInput?.value).toBe('legacy-string-csrf');
  });

  it('keeps the Legacy form off-DOM until one callback appends and submits it', async () => {
    const { body, form, setTimeoutMock } = installPage({
      sessionData: JSON.stringify({ prismModeEnabled: false }),
    });
    const csrf = 'page-local-csrf';
    vi.stubGlobal('AWSC', { Auth: { getMbtc: () => csrf } });

    const result = await submitAwsSwitchRoleInPage(request);

    expect(result).toEqual({ status: 'submitted', mode: 'legacy' });
    expect(JSON.stringify(result)).not.toContain(csrf);
    expect(body?.append).not.toHaveBeenCalled();
    expect(form.submit).not.toHaveBeenCalled();
    expect(setTimeoutMock).toHaveBeenCalledTimes(1);

    const callback = setTimeoutMock.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(callback).toBeTypeOf('function');
    callback?.();

    expect(body?.append).toHaveBeenCalledWith(form);
    expect(form.submit).toHaveBeenCalledTimes(1);
    expect((body?.append as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan(
      form.submit.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['true', true],
    ['false', false],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['object', {}],
    ['array', []],
    ['empty string', ''],
    ['whitespace-only string', '   '],
  ] as Array<[string, unknown]>)('rejects invalid legacy CSRF value: %s', async (_label, value) => {
    const { body, form } = installPage({
      sessionData: JSON.stringify({ prismModeEnabled: false }),
    });
    const setTimeoutMock = vi.fn();
    vi.stubGlobal('setTimeout', setTimeoutMock);
    vi.stubGlobal('AWSC', { Auth: { getMbtc: () => value } });

    await expect(submitAwsSwitchRoleInPage(request)).resolves.toEqual({
      status: 'unavailable',
      reason: 'LEGACY_CSRF_UNAVAILABLE',
    });
    expect(body?.append).not.toHaveBeenCalled();
    expect(form.submit).not.toHaveBeenCalled();
    expect(setTimeoutMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the legacy CSRF and document body failure codes', async () => {
    installPage({
      sessionData: JSON.stringify({ prismModeEnabled: false }),
    });
    await expect(submitAwsSwitchRoleInPage(request)).resolves.toEqual({
      status: 'unavailable',
      reason: 'LEGACY_CSRF_UNAVAILABLE',
    });

    vi.stubGlobal('AWSC', { Auth: { getMbtc: () => 1234567890 } });
    installPage({
      sessionData: JSON.stringify({ prismModeEnabled: false }),
      body: false,
    });
    vi.stubGlobal('AWSC', { Auth: { getMbtc: () => 1234567890 } });
    await expect(submitAwsSwitchRoleInPage(request)).resolves.toEqual({
      status: 'unavailable',
      reason: 'DOCUMENT_BODY_UNAVAILABLE',
    });
  });
});
