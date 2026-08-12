# ADR 0003: Flat Jump Target Search

## Status

Accepted

## Context

Roo's value is fast movement to a known AWS destination. A hierarchical account-to-role browsing flow adds steps and exposes internal configuration structure to normal use.

## Decision

Roo MUST use a search-first Popup. Roo MUST NOT show the full catalog before 3 typed characters; after that threshold, Roo MUST match locally. One row MUST equal one executable Jump Target. The complete row MUST be clickable, with mouse-first interaction and ArrowUp, ArrowDown, and Enter keyboard support. Hover and keyboard selection MUST use the same background state. The first result MUST be selected when a new result set is produced.

Roo MUST NOT use a wizard, hierarchical account → role Popup navigation, a separate Jump button, table headers, or an instructional keyboard footer.

## Consequences

Users move directly from search to an AWS Console role switch, while Search remains independent from React rendering. The UI MUST keep role paths internally even when it displays short role names.

## Rejected alternatives

Reject hierarchical account → role popup navigation, confirmation-oriented wizard flows, and separate action buttons for row activation.
