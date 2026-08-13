import type { AwsSwitchRoleRequest } from './build-aws-switch-role-request';
import type {
  AwsJumpFailureCode,
  AwsSwitchRoleSubmissionResult,
} from './aws-jump-result';

export async function submitAwsSwitchRoleInPage(
  request: AwsSwitchRoleRequest,
): Promise<AwsSwitchRoleSubmissionResult> {
  const endpoint = 'https://signin.aws.amazon.com/switchrole';
  const unavailable = (reason: AwsJumpFailureCode): AwsSwitchRoleSubmissionResult => ({
    status: 'unavailable',
    reason,
  });

  if (
    typeof request !== 'object' ||
    request === null ||
    request.endpoint !== endpoint ||
    typeof request.account !== 'string' ||
    !/^\d{12}$/.test(request.account) ||
    typeof request.roleName !== 'string' ||
    request.roleName.trim().length === 0 ||
    typeof request.displayName !== 'string' ||
    request.displayName.trim().length === 0
  ) {
    return unavailable('INVALID_REQUEST');
  }

  const hasExplicitPort = (value: string): boolean => {
    const authority = value.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1] ?? '';
    const hostAuthority = authority.slice(authority.lastIndexOf('@') + 1);
    return hostAuthority.includes(':');
  };

  const isCommercialSigninHost = (hostname: string): boolean =>
    hostname === 'signin.aws.amazon.com' || hostname.endsWith('.signin.aws.amazon.com');

  const normalizeSigninHost = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
      return null;
    }

    let parsed: URL;

    try {
      const isUrlForm = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
      parsed = new URL(isUrlForm ? value : `https://${value}`);
    } catch {
      return null;
    }

    if (
      parsed.protocol !== 'https:' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.port !== '' ||
      hasExplicitPort(value) ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase();
    return isCommercialSigninHost(hostname) ? hostname : null;
  };

  const sessionElement = document.querySelector('meta[name="awsc-session-data"]');
  const sessionData = sessionElement === null ? null : sessionElement.getAttribute('content');
  let sessionMetadata: Record<string, unknown> | null = null;

  if (sessionElement !== null) {
    if (sessionData === null) {
      return unavailable('SESSION_METADATA_INVALID');
    }

    try {
      const parsed = JSON.parse(sessionData) as unknown;

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return unavailable('SESSION_METADATA_INVALID');
      }

      sessionMetadata = parsed as Record<string, unknown>;
    } catch {
      return unavailable('SESSION_METADATA_INVALID');
    }
  }

  const prismModeEnabled =
    sessionMetadata?.prismModeEnabled === true ||
    sessionMetadata?.prismModeEnabled === 'true';
  const hasMetadataSigninEndpoint = sessionMetadata !== null &&
    Object.prototype.hasOwnProperty.call(sessionMetadata, 'signInEndpoint');
  const metadataSigninEndpoint = sessionMetadata?.signInEndpoint;
  const signinEndpointElement = document.querySelector('#awsc-signin-endpoint');
  const hasFallbackSigninEndpoint = signinEndpointElement !== null;
  const fallbackSigninEndpoint = signinEndpointElement?.getAttribute('content');

  let signInHost = 'signin.aws.amazon.com';

  if (hasMetadataSigninEndpoint) {
    signInHost = normalizeSigninHost(metadataSigninEndpoint) ?? '';
  } else if (hasFallbackSigninEndpoint) {
    signInHost = normalizeSigninHost(fallbackSigninEndpoint) ?? '';
  }

  if (signInHost.length === 0) {
    return unavailable('SIGNIN_ENDPOINT_INVALID');
  }

  const isCommercialConsoleHost = (hostname: string): boolean =>
    hostname === 'console.aws.amazon.com' ||
    hostname.endsWith('.console.aws.amazon.com') ||
    hostname === 'health.aws.amazon.com' ||
    hostname === 'lightsail.aws.amazon.com';

  if (prismModeEnabled) {
    const sessionDifferentiator = sessionMetadata?.sessionDifferentiator;

    if (
      typeof sessionDifferentiator !== 'string' ||
      sessionDifferentiator.trim().length === 0
    ) {
      return unavailable('PRISM_SESSION_MISSING');
    }

    let redirectUrl: URL;

    try {
      redirectUrl = new URL(globalThis.location.href);
      const sessionPrefix = `${sessionDifferentiator}.`;

      if (redirectUrl.hostname.startsWith(sessionPrefix)) {
        redirectUrl.hostname = redirectUrl.hostname.slice(sessionPrefix.length);
      }
    } catch {
      return unavailable('PRISM_DESTINATION_INVALID');
    }

    if (
      redirectUrl.protocol !== 'https:' ||
      redirectUrl.username !== '' ||
      redirectUrl.password !== '' ||
      redirectUrl.port !== '' ||
      hasExplicitPort(globalThis.location.href) ||
      !isCommercialConsoleHost(redirectUrl.hostname.toLowerCase())
    ) {
      return unavailable('PRISM_DESTINATION_INVALID');
    }

    const switchEndpoint =
      `https://${signInHost}/sessions/${encodeURIComponent(sessionDifferentiator)}/v1/switchrole`;
    let response: Response;

    try {
      response = await globalThis.fetch(switchEndpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRF-PROTECTION': '1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          account: request.account,
          color: 'aaaaaa',
          displayName: request.displayName,
          redirectUri: redirectUrl.href,
          roleName: request.roleName,
        }),
      });
    } catch {
      return unavailable('PRISM_REQUEST_FAILED');
    }

    if (response.ok !== true) {
      return unavailable('PRISM_HTTP_FAILED');
    }

    let responseBody: unknown;

    try {
      responseBody = await response.json();
    } catch {
      return unavailable('PRISM_RESPONSE_INVALID');
    }

    const destination =
      typeof responseBody === 'object' && responseBody !== null
        ? (responseBody as { destination?: unknown }).destination
        : undefined;

    if (typeof destination !== 'string' || destination.trim().length === 0) {
      return unavailable('PRISM_RESPONSE_INVALID');
    }

    let parsedDestination: URL;

    try {
      parsedDestination = new URL(destination);
    } catch {
      return unavailable('PRISM_DESTINATION_INVALID');
    }

    if (
      parsedDestination.protocol !== 'https:' ||
      parsedDestination.username !== '' ||
      parsedDestination.password !== '' ||
      parsedDestination.port !== '' ||
      hasExplicitPort(destination) ||
      !isCommercialConsoleHost(parsedDestination.hostname.toLowerCase())
    ) {
      return unavailable('PRISM_DESTINATION_INVALID');
    }

    globalThis.setTimeout(() => {
      globalThis.location.assign(destination);
    }, 0);

    return { status: 'submitted', mode: 'prism' };
  }

  let rawCsrf: unknown;

  try {
    const auth = (globalThis as {
      AWSC?: { Auth?: { getMbtc?: () => unknown } };
    }).AWSC?.Auth;

    if (typeof auth?.getMbtc !== 'function') {
      return unavailable('LEGACY_CSRF_UNAVAILABLE');
    }

    rawCsrf = auth.getMbtc();
  } catch {
    return unavailable('LEGACY_CSRF_UNAVAILABLE');
  }

  let csrf: string;

  if (typeof rawCsrf === 'string') {
    if (rawCsrf.trim().length === 0) {
      return unavailable('LEGACY_CSRF_UNAVAILABLE');
    }

    csrf = rawCsrf;
  } else if (
    typeof rawCsrf === 'number' &&
    Number.isFinite(rawCsrf)
  ) {
    csrf = String(rawCsrf);
  } else {
    return unavailable('LEGACY_CSRF_UNAVAILABLE');
  }

  const body = document.body;

  if (!body) {
    return unavailable('DOCUMENT_BODY_UNAVAILABLE');
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `https://${signInHost}/switchrole`;
  form.target = '_top';
  form.style.display = 'none';

  const fields = [
    ['mfaNeeded', '0'],
    ['action', 'switchFromBasis'],
    ['src', 'nav'],
    ['csrf', csrf],
    ['roleName', request.roleName],
    ['account', request.account],
    ['color', 'aaaaaa'],
    ['redirect_uri', encodeURIComponent(globalThis.location.href)],
    ['displayName', request.displayName],
  ] as const;

  for (const [name, value] of fields) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }

  globalThis.setTimeout(() => {
    body.append(form);
    form.submit();
  }, 0);

  return { status: 'submitted', mode: 'legacy' };
}
