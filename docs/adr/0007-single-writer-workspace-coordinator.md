# ADR 0007: Single-Writer Workspace Coordinator

## Status

Accepted

## Context

Options and Popup previously loaded and mutated separate storage snapshots. That allowed stale reads, list-position mutations, import races, and UI-specific resolution behavior. A browser extension can have multiple Roo windows open at once, so React state cannot be the authority for identity or persistence.

## Decision

All workspace operations cross one typed runtime-message protocol:

- `GET_WORKSPACE`
- `IMPORT_CATALOG`
- `ADD_LOCAL_ACCOUNT`
- `UPDATE_LOCAL_ACCOUNT`
- `REMOVE_LOCAL_ACCOUNT`

Each browser background context owns one `WorkspaceCoordinator` and one FIFO
promise queue. WXT generates the MV3 service-worker form for Chrome and Edge
and the MV2 background form for Firefox. Every read waits behind queued writes.
Each operation re-reads the authoritative catalog and Local Account snapshots
before validation and persistence; the coordinator does not maintain a
long-lived workspace cache.

The coordinator owns immutable Local Account UUIDs, per-record versions, catalog versions, snapshot versions, stable-ID mutation, expected-version checks, collision checks, and the exact stale-workspace error. Storage repositories runtime-check versioned envelopes and retain legacy data during migration. A pure Workspace View is the only resolved read model consumed by Options and Popup.

The background context is local-only. It must not make network or AWS calls,
inspect pages, read cookies or credentials, emit telemetry, or add permissions
beyond `storage`. React components must not access persistence directly.

## Consequences

Concurrent windows serialize through one authority, stale edits fail without overwriting newer data, and unrelated records remain addressable by stable ID. Options and Popup share one status, diagnostics, effective-target set, and summary. The background context is coordination infrastructure, not an AWS client or a remote data service.

## Rejected alternatives

Reject direct storage access from each UI, list-index mutation, a UI-owned cache, optimistic persistence without an authoritative reread, and separate Popup/Options merge implementations.
