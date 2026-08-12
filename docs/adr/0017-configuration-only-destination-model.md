# ADR 0017: Configuration-only Destination Model

## Status

Accepted

## Context

Roo was not publicly released when this decision was made. Local Accounts were
an unreleased second destination source. Maintaining two sources created
separate persistence, mutation, merge, collision, repair, and Settings paths
for a feature that never shipped.

## Decision

Roo now derives all destinations exclusively from one current Configuration.

Local Account storage, mutations, merge/collision logic, repair semantics, and
Settings UI are removed. No Local Account migration or compatibility layer is
provided. Former development-profile Local Account storage keys are ignored
and untouched.

Workspace exposes one target model rather than imported/effective target
variants. Configuration schema is unchanged. WorkspaceCoordinator remains the
single writer for current Configuration. The Popup hot-path and cache
architecture from ADR 0016 remains.

The current source flow is:

```text
Persisted Configuration
→ resolve Configuration scopes
→ Workspace targets
→ PopupBootstrap
→ Search / Jump
```

## Non-goals

- no Configuration schema redesign
- no CodeMirror lazy-loading work in this step
- no editor debounce work in this step
- no Popup framework rewrite
- no AWS context redesign
- no Jump redesign

## Consequences

Roo has one authoritative destination source and one target model. Old
development-profile storage is inert unknown storage: Roo neither reads nor
writes, migrates, cleans up, or deletes it. The next convergence step may
optimize the Configuration editor without restoring a second destination
source.
