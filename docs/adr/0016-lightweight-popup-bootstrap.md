# ADR 0016: Lightweight Popup Bootstrap

## Status

Accepted

## Context

Popup is Roo's primary hot path. It previously requested and received a complete
`WorkspaceView`, then made a second runtime request for AWS tab context in
Organization Mode. Cold Workspace construction also loaded its independent
catalog and Local Account sources sequentially, while the loading shell disabled
the primary Search interaction.

ADR 0007 rejected a long-lived Workspace cache to protect mutation authority.
This ADR supersedes only that cache prohibition by defining a non-authoritative,
memory-only read optimization. ADR 0007's single-writer and fresh mutation-read
requirements remain accepted.

## Decision

- Popup uses one `GET_POPUP_BOOTSTRAP` background request.
- Background resolves Simple or Organization Mode before responding.
- Background returns minimal `PopupBootstrap`, not `WorkspaceView`.
- `WorkspaceView` is cached only in background memory.
- The cache is never authoritative for writes.
- Every mutation validates against fresh persisted sources.
- Relevant catalog or Local Account storage changes invalidate the cache.
- Successful mutations replace the cache with a freshly built Workspace View.
- Cold catalog and Local Account reads execute concurrently.
- A ready AWS context performs a best-effort Workspace cache warm-up.
- Popup Search remains interactive while bootstrap is pending.
- A query entered before bootstrap completes remains the active query.

## Consequences

The hot Popup path transfers only its render model and can normally reuse an
already-built Workspace. Cache loss or background restart affects performance,
not correctness. Organization ownership and failure behavior stay in the
background domain boundary, and writes retain authoritative stale, collision,
scope, record-version, and effective-role checks.

## Non-goals

- No persistent Workspace cache.
- No `browser.storage.session` cache.
- No search-index persistence.
- No Popup framework rewrite.
- No native-DOM rewrite in this step.
- No Options editor optimization in this step.
