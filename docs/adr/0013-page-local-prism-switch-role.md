# ADR 0013: Page-Local Prism Switch Role Request

## Status

Accepted

## Context

AWS Console Prism sessions do not expose the legacy `AWSC.Auth.getMbtc()` form
capability. Their Switch Role path is an explicit, authenticated session JSON
request made from the active AWS Console page. Roo must support that path while
retaining its credential-free, on-demand, commercial-only architecture.

## Decision

Roo keeps all extension-context runtime paths free of AWS network requests. The
only runtime network exception is the explicit-user-initiated Prism Switch
Role request executed by the one-shot MAIN-world Jump executor in the active
supported AWS Console tab.

The executor reads only the current page's `prismModeEnabled`,
`signInEndpoint`, and `sessionDifferentiator` metadata. It validates the
commercial session-specific sign-in hostname, sends one POST with
`credentials: include`, and validates the returned commercial AWS destination
before scheduling navigation. The request body contains only the structured
account, role, display name, current-page redirect URI, and fixed color.

The executor never returns CSRF data, session metadata, the session
differentiator, cookies, credentials, response bodies, or destinations to
extension context. No such value is persisted. Legacy mode remains a
page-local transient form POST requiring `AWSC.Auth.getMbtc()` and does not
perform a Prism request.

This ADR supersedes only the absolute no-network wording for the explicit
page-local Prism request in ADR 0011 and related security documentation. The
credential-free boundary, minimal permissions, absence of host permissions and
content scripts, and commercial AWS partition restriction remain unchanged.

## Consequences

Roo supports both current AWS Console session switch mechanisms without
receiving AWS credentials or expanding extension permissions. The injected
executor must keep host and destination validation strict, and built-extension
E2E must prove successful legacy and Prism activation plus controlled failure.

## Rejected alternatives

Reject an extension-context network client, AWS API or SDK access, cookie APIs,
exporting CSRF or session metadata, persistent content scripts, host
permissions, arbitrary destinations, and treating the legacy form path as a
Prism capability signal.
