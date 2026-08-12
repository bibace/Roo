# ADR 0014: Persistent AWS Tab Context Lifecycle

## Status

Partially Superseded

## Supersession

ADR 0014 supersedes the page-lifecycle and content-script prohibition portions
of ADR 0011.

The registry revision and unavailable-state storage model is superseded by ADR
0015.

## Context

Roo is a compact search-first AWS account and role navigator. Its previous
one-shot `activeTab` design began context discovery only when the Popup opened.
That imposed unnecessary interaction and lifecycle friction for a
navigation-only tool: an AWS tab could be visibly associated with Roo, yet Roo
had no durable live association after the Popup closed. AWS-page association is
now an intentional product capability.

## Decision

Roo installs one static content lifecycle only on the supported commercial AWS
Console hosts. The content script signals lifecycle events. The background owns
sanitized tab-scoped context. The background performs the existing MAIN-world
snapshot read with the existing ISOLATED fallback. Roo UI remains transient and
search-first. Persistent AWS awareness does not mean persistent Roo UI.

The lifecycle matches exactly:

```text
https://console.aws.amazon.com/*
https://*.console.aws.amazon.com/*
https://health.aws.amazon.com/*
https://lightsail.aws.amazon.com/*
```

The content lifecycle performs no page-data reads, credential access, storage,
network request, organization resolution, or navigation. The background keeps
only normalized account/session-mode context in an in-memory registry keyed by
tab ID. A registry revision changes only when the semantic context changes.
Navigation and lifecycle refreshes update the same tab record; tab removal,
loading navigation, and replacement remove stale state. Query fallback can
rebuild context after a background restart.

ADR 0014 preserves:

- credential-free AWS navigation
- no STS
- no AWS SDK
- no credential/cookie persistence
- no external AWS-context network transmission
- tab-scoped organization semantics
- WorkspaceCoordinator single-writer architecture

The supported permissions remain `storage` and `scripting`, with the exact
four-pattern commercial AWS host allowlist and one static AWS lifecycle content
script. Roo does not add `tabs`, `webNavigation`, `webRequest`, `cookies`,
history, broad host access, or arbitrary content scripts.

## Consequences

AWS tab context persists in background lifecycle state. The Popup consumes it
through the typed runtime protocol. Toolbar action availability is tab-scoped to
supported AWS Console URLs. Roo UI remains transient and search-first.
