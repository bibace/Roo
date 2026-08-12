# AWS Console Navigation Specification

## Boundary

AWS Navigation has a pure request builder and a separate one-shot page
submission boundary:

```text
Jump
  ↓
active supported commercial AWS Console tab
  ↓
read current AWS session mode in MAIN world
  ↓
legacy ──→ scheduled transient form POST
  │
  └ prism ─→ session switch JSON POST
              ↓
            AWS destination
              ↓
            scheduled page navigation
```

The pure request builder MUST be:

```ts
buildAwsSwitchRoleRequest(target: JumpTarget): AwsSwitchRoleRequest
```

It MUST accept only a `JumpTarget`. It MUST NOT access browser APIs, extension
storage, cookies, credentials, configuration files, network services, or AWS
APIs. It MUST NOT navigate or mutate the input target. The page executor is
serialized into `browser.scripting.executeScript()` and is the only navigation
submission path.

## Context detection boundary

Organization Mode context detection supports only the standard commercial AWS
partition, using HTTPS and rejecting URL credentials. Supported hosts are
`console.aws.amazon.com` and its dot-boundary subdomains,
`health.aws.amazon.com`, and `lightsail.aws.amazon.com`, with case-insensitive
hostname comparison. GovCloud, China, and EU Sovereign AWS Console hosts are
unsupported because Roo navigation uses the fixed commercial endpoint. Normal
toolbar activation is unavailable on unsupported or non-AWS tabs. A direct or
stale Popup invocation still fails safely with `Open Roo from a supported AWS
Console tab.`, disables Search, and exposes zero accounts, roles, and result
rows.

Toolbar action availability is derived only from the effective tab URL. A
supported URL remains enabled during loading and when context is unavailable;
loading invalidates the previous context but not action availability. Context
readiness controls Organization Mode Popup contents after the Popup opens.

## Fixed AWS destination

Roo v1 MUST support only the standard commercial AWS partition. The endpoint
MUST be exactly:

```text
https://signin.aws.amazon.com/switchrole
```

The request builder MUST return this endpoint in `endpoint`. The navigation API
MUST NOT accept an endpoint, hostname, scheme, origin, or base URL from the
caller. The endpoint MUST NOT come from configuration or target data.

The request fields MUST be exactly:

```ts
{
  endpoint: 'https://signin.aws.amazon.com/switchrole',
  account: target.accountId,
  roleName: target.role,
  displayName: `${target.accountName} | ${target.accountId}`,
}
```

`displayName` is derived runtime state. It MUST use Roo's normalized account
name and MUST NOT be configured or persisted.

## Submission contract

Popup Jump MUST query the active tab in the current window, require exactly one
usable tab with a numeric ID and string URL, require
`isSupportedAwsConsoleUrl(tab.url)`, and execute the submission function in
MAIN world against that tab's top frame. It MUST NOT create a second tab.

The executor MUST read `meta[name="awsc-session-data"]` in MAIN world and use
only `prismModeEnabled`, `signInEndpoint`, and `sessionDifferentiator`. The
selected commercial sign-in hostname is validated before use. Mode selection
MUST be `prismModeEnabled === true` for Prism and Legacy otherwise.

Legacy:
`AWSC.Auth.getMbtc` is required. The executor MUST create a transient hidden
POST form whose target is `_top`, whose action is
`https://<validated-signin-host>/switchrole`, and whose fields are exactly
`mfaNeeded`, `action`, `src`, `csrf`, `roleName`, `account`, `color`,
`redirect_uri`, and `displayName`. `redirect_uri` MUST be derived from the
active supported AWS Console page URL and is not configuration.

Prism:
`AWSC.Auth.getMbtc` is not required. The executor MUST send one JSON POST to
`https://<validated-signin-host>/sessions/<encoded-sessionDifferentiator>/v1/switchrole`
with the page's authenticated session, validate the returned commercial AWS
destination, and navigate only to that destination.

AWS multi-session Console URLs contain a session-specific hostname prefix. For
Prism, `prismModeEnabled` is enabled only by the exact values `true` or
`'true'`. Before the switch request, Roo MUST remove only the current
`sessionDifferentiator` plus its following dot from the leading hostname label
of the current Console URL. The resulting `redirectUri` MUST remain an HTTPS,
credential-free, port-free commercial AWS Console URL. The destination
returned by AWS may contain the destination session prefix.

Both modes MUST return a submitted result only after their request has been
accepted for the page-local path. Scheduled form submission and scheduled
navigation occur only after the injected execution has returned its successful
result. The executor returns only submitted/unavailable status and mode; it
does not return session metadata, destinations, or CSRF data to extension code.

GET prefill navigation is not Roo's Jump mechanism.

## Validation

The builder MUST defensively validate runtime input. `accountId` MUST be a
string containing exactly 12 decimal digits. Invalid account IDs MUST throw
`AwsNavigationError` with code `INVALID_ACCOUNT_ID`.

`role` MUST pass the shared `isValidAwsConsoleRole()` validator. Invalid roles
MUST throw `AwsNavigationError` with code `INVALID_ROLE`. The builder MUST NOT
silently trim a role.

The shared role validator MUST reject empty values, whitespace, ASCII control
characters, non-ASCII characters, leading or trailing `/`, empty path segments,
final RoleName characters outside `[A-Za-z0-9_+=,.@-]+`, and complete role
path/name values longer than 64 characters. Printable URL-significant
characters MUST remain accepted in path segments before the final RoleName.

## Construction and security

The builder MUST construct the fixed structured request without browser or page
state. Target data MUST NOT change the endpoint or override the fixed request
shape. The executor MUST obtain page-local `AWSC.Auth.getMbtc()` only during
explicit Jump activation, place it directly into the transient form, and never
return it to extension code.

The navigation boundary MUST generate destinations only from validated
structured account and role data. It MUST NOT read, store, request, derive,
log, or transmit AWS credentials, cookies, tokens, federation credentials, or
STS data.

## Rejected URL inputs

A Roo configuration object or navigation caller MUST NOT supply `url`, `href`,
`destinationUrl`, `switchRoleUrl`, `endpoint`, `hostname`, `origin`, `scheme`,
or an arbitrary URL. The navigation API MUST NOT expose an overload or generic
URL utility for these inputs.

## Error behavior

Invalid navigation input MUST fail synchronously with `AwsNavigationError`. The
stable error codes MUST be exactly `INVALID_ACCOUNT_ID` and `INVALID_ROLE`.
Error messages MUST remain concise and MUST NOT expose raw configuration
values, credentials, cookies, tokens, or session information.

Controlled Jump failures expose a non-sensitive diagnostic code in the Popup.
The code MUST NOT contain session metadata, URLs, credentials, CSRF, or HTTP
response bodies.
