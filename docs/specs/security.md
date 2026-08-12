# Roo Security Specification

## Credential-Free Boundary

Roo MUST NOT read, store, request, derive, export, log, or transmit AWS Access Key IDs, AWS Secret Access Keys, STS temporary credentials, AWS Console session cookies, SAML assertions, OIDC tokens, or passwords.

Roo MUST NOT call `AssumeRole`, use AWS SDK credential workflows, create federation credentials, call AWS APIs, or inspect AWS pages outside the exact AWS-only content lifecycle and background snapshot boundary. The lifecycle may signal page events only. The background may read only sanitized account identity fields, a multi-session boolean, and a source marker from supported commercial AWS Console pages. Roo uses only the user's existing authenticated AWS Console browser session.

## Browser and Code Boundaries

Every supported browser target MUST retain the same minimal privilege model:
Chrome and Edge use Manifest V3, Firefox uses Manifest V2, and each generated
manifest MUST request exactly the named permissions `storage` and `scripting`.
Roo MUST
NOT request broad or arbitrary host permissions, `<all_urls>`, `tabs`, `unlimitedStorage`,
`cookies`, `webRequest`, `webRequestBlocking`, `webNavigation`, `history`,
`identity`, `management`, `nativeMessaging`, or any other permission.
The only host access is the exact four-pattern commercial AWS Console allowlist
used by the static content lifecycle and background snapshot boundary. The AWS
URL guard supports only the standard commercial AWS partition, matching the
fixed AWS Switch Role endpoint.

The same URL guard is the sole toolbar action-availability authority. Loading
or unavailable sanitized context does not disable an otherwise supported tab;
unsupported or missing URLs remain disabled.

Roo MUST use one local-only background context per extension execution as the
typed single-writer Workspace coordinator and AWS tab-context owner. Chrome/Edge
use a service worker and Firefox uses the generated MV2 background form. One
static content lifecycle is matched only to the exact commercial AWS Console
allowlist. It signals initial execution, page visibility/focus, and
same-document navigation events; it MUST NOT read page data or make requests.
The background performs an argument-free MAIN-world snapshot read after the
supported AWS URL guard and uses one ISOLATED-world fallback only when MAIN
execution throws. The reader MUST NOT receive extension-private data and MUST
return only sanitized account identity fields, a multi-session boolean, and a
source marker. The coordinator, tab-context store, and all extension-context runtime
paths MUST NOT perform network, AWS API, cookie, credential, or telemetry
operations.
Remote configuration, where discussed as an ownership concept, MUST remain
data only; Roo v1 MUST perform no catalog-network operations.

Extension contexts MUST NOT perform AWS network requests.

The only permitted runtime network request is the explicit-user-initiated
Prism Switch Role request executed inside the active AWS Console MAIN world.

That request MUST target only the validated commercial AWS session-specific
sign-in endpoint and MUST use the page's existing authenticated browser
session through credentials: include.

AWS multi-session Console URLs contain a session-specific hostname prefix. Roo
MUST remove only the current `sessionDifferentiator` hostname prefix from the
Prism `redirectUri` before the page-local switch request. The returned
destination may contain a different session-specific Console hostname and
MUST still pass the commercial AWS Console destination validator.

No response body, sessionDifferentiator, cookie, credential, or AWS session
metadata is persisted.

Controlled Jump failures may expose a non-sensitive diagnostic code to the
Popup, but never session metadata, URLs, credentials, CSRF, or HTTP response
bodies.

Production runtime code MUST NOT use `XMLHttpRequest`, `WebSocket`,
`EventSource`, `eval`, or `new Function` for product behavior.

Roo MUST NOT read usernames, email addresses, cookies, tokens, SAML/OIDC data,
AWS access keys, STS credentials, or AWS API responses. The last-ready sanitized
AWS context is tab-scoped background memory and MUST NOT be persisted as AWS
identity in local, sync, or session storage. AWS account identity and active
organization runtime state are not persisted. Organization Mode remains
tab-scoped; base-login evidence precedes current-account evidence and conflicts
fail closed. Temporary same-document read failure retains only the last-ready
sanitized context in background memory; loading navigation invalidates it.

Extension contexts, Workspace messages, storage, logs, and returned scripting
results MUST NOT receive AWS CSRF data.

The only permitted CSRF interaction is the one-shot MAIN-world Jump executor
after explicit user destination activation. In Legacy mode, that executor MUST
obtain AWSC.Auth.getMbtc() inside the active supported AWS Console page, place
the value directly into the transient fixed-endpoint Switch Role form, submit
the form, and return no CSRF value. Prism mode MUST NOT require or send a CSRF
value.

The CSRF value MUST never cross from page execution into extension state.

Local YAML and JSON content MUST be treated as untrusted data. The importer MUST use JSON parsing for JSON and strict YAML 1.2 core parsing with string keys and unique keys. It MUST reject aliases, custom tags, `!include`, YAML warnings, parse errors, and multi-document streams. Configuration documents entering the current imported-catalog boundary MUST pass `normalizeRooConfigDocument()` before resolution. The v1-specific `normalizeRooConfig()` normalizer remains a compatibility boundary for v1-only data.

Persisted Configuration data MUST be treated as untrusted input and MUST pass
strict envelope, source identity, schema, and normalization validation before
Popup use. Saves MUST persist only the normalized `PersistedConfigurationV1`
envelope under `local:roo-configuration-v1`, with a monotonic catalog version.
The source identity is strictly either `created` or `uploaded` with one safe
local YAML/JSON filename. Roo MUST NOT persist raw source, a filesystem path, a
`File` object, a file handle, resolved Jump Targets, AWS context, or search
indexes. Former development storage keys are unknown and MUST NOT be read,
migrated, rewritten, or deleted automatically.

Created Clear changes only the in-memory canonical draft until explicit Save
and retains Created source identity. Uploaded Delete requires the current ready
catalog token, Uploaded source identity, and exact original filename at the
single-writer coordinator boundary. It removes only
`local:roo-configuration-v1`. Roo retains no local file path or handle, cannot
modify the user's original file, does not remove former development or Local
Account keys, and does not create a default Configuration after Delete.

Roo MUST NOT infer a user's persona or team, grant or assume team-specific
roles by default, or use a remote lookup to choose roles. It only navigates to
explicitly configured structured roles. Unknown legacy storage keys are
ignored and remain untouched; Roo does not migrate, delete, or write them.

## Navigation Safety

Arbitrary external URLs MUST NOT become AWS navigation destinations. The AWS Navigation boundary MUST generate only `https://signin.aws.amazon.com/switchrole` from validated structured `accountId` and complete role fields. The endpoint MUST remain fixed internally, and configuration MUST NOT provide URL, endpoint, hostname, origin, redirect, or destination fields.

IAM role syntax MUST be validated by one shared domain validator for configuration and runtime navigation. The validator MUST reject whitespace, control characters, non-ASCII characters, empty path segments, invalid final RoleName characters, and complete paths longer than 64 characters.

Configuration editing MUST not add browser permissions, host permissions,
unrelated content scripts, network calls, cookies, tokens, or credential fields.
Configuration remains local, normalized, and subject to the same fixed AWS
Navigation boundary as every Jump Target.

Release verification enforces evidence-derived ZIP and initial Options-entry
budgets without weakening manifest, CSP, remote-code, or lazy-editor checks.
