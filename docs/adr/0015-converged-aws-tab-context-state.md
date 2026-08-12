# ADR 0015: Converged AWS Tab Context State

## Status

Accepted

## Decision

Roo keeps one background last-ready sanitized AWS context per browser tab.

- Organization fallback state is not stored in `browser.storage.session` or any
  other browser storage.
- A transient same-document unavailable refresh retains the last-ready context.
- A full loading navigation invalidates the last-ready context.
- Removing a browser tab deletes its context and internal refresh generation.
- Per-tab internal generation ordering prevents stale refresh completion from
  overwriting newer state.
- Generation is an internal background detail and never crosses the runtime
  protocol.
- Popup resolves organization from the current or retained sanitized AWS
  context.
- A background restart rebuilds context from the active supported AWS page.

The state remains tab-scoped, credential-free, and memory-only. Roo uses no AWS
SDK or STS and does not persist AWS identity. WorkspaceCoordinator remains the
single writer for Workspace persistence.

## Consequences

Same-document lifecycle noise does not make an established Popup context
unusable, while a loading navigation cannot expose the previous page's account.
Different tabs and last-focused browser windows remain independent. A restarted
background must read the current supported page again before Organization Mode
can resolve an organization.
