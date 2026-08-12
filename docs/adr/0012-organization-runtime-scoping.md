# ADR 0012: Organization Runtime Scoping

## Status

Partially Superseded

The `browser.storage.session` organization-fallback decision is superseded by
ADR 0015.

## Context

Config v2 can contain multiple organizations with overlapping project and
environment names. The on-demand commercial AWS Console context boundary
supplies a narrow runtime signal, while Popup and Local Accounts need
deterministic ownership without flattening organization data or persisting AWS
identity.

## Decision

- Active organization is scoped to the active browser tab.
- Fresh sanitized AWS page context is authoritative.
- Base-login ID or alias evidence is evaluated before current-account evidence.
- Evidence resolving to different organizations is a conflict and fails closed.
- Unknown, unscoped, or multi-session-only evidence is unresolved.
- A per-tab `browser.storage.session` cache is fallback state only after a
  temporary unavailable context result. It is catalog-versioned and stores
  only the organization ID; it contains no AWS identity and is not authoritative.
- Organization-scoped Local Accounts require an organization for executable
  targets. Missing or unknown organization assignments remain visible in
  Settings for repair and are excluded from Popup.
- Catalog persistence is v4 and Local Account persistence is v3. Valid legacy
  snapshots migrate without destructive deletion; invalid active snapshots do
  not fall back to older data.
- Workspace retains Simple and organization scopes independently. Organization
  targets are never flattened into one Popup catalog. Simple Mode remains
  context-independent and compatible with the v1 workflow.

## Consequences

Each AWS tab can resolve a different organization while one coordinator keeps
storage writes serialized. Popup can fail closed for ambiguous ownership without
exposing unrelated organization targets. Session cache loss only affects
temporary context-unavailable fallback; a fresh page read can establish the
authoritative scope again.

## Rejected alternatives

Reject global active-organization state, cache-first resolution, storing AWS
account context in local or sync storage, flattening all organization targets,
and silently assigning unscoped Local Accounts to an organization.
