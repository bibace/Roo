# ADR 0009: Cross-Browser Build Targets

## Status

Accepted

## Context

Roo's stable v1 implementation was packaged only as a Chrome Manifest V3
extension. The product needs deliberately supported Chrome, Edge, and Firefox
artifacts without creating browser-specific application behavior or weakening
the existing permission boundary.

## Decision

Use one WXT source tree and one shared Roo application/domain architecture for
the supported desktop targets:

| Browser | Manifest | Build target |
| --- | --- | --- |
| Google Chrome / Chromium | MV3 | `chrome` |
| Microsoft Edge | MV3 | `edge` |
| Mozilla Firefox | MV2 | `firefox` |

Release commands select the browser and manifest version explicitly. WXT
independently generates `.output/chrome-mv3`, `.output/edge-mv3`, and
`.output/firefox-mv2`. Chrome and Edge use the generated MV3 service-worker
form; Firefox uses the generated MV2 background form from the same background
entrypoint.

Browser-specific code is limited to build target, manifest generation,
background manifestation, packaging, and verification. `WorkspaceCoordinator`,
the typed runtime protocol, storage repositories, Workspace View, search,
navigation, configuration semantics, Local Account semantics, and Settings /
Popup behavior remain shared. Firefox has the persistent product identity
`roo@bibace` and declares `data_collection_permissions.required` as `['none']`.

Every target retains exactly the named `storage` and `scripting` permissions.
AWS page access is restricted to the exact existing four-pattern commercial AWS
allowlist, and the one static content lifecycle is restricted to the same
allowlist. No `tabs`, `webNavigation`, `webRequest`, `cookies`, or broad host
access is granted. Each browser profile owns its Roo storage;
cross-browser synchronization is out of scope.

## Consequences

The same product behavior is tested against independently generated Chrome and
Edge-target Chromium artifacts. Firefox receives Firefox-specific manifest and
`web-ext` lint evidence plus manual runtime smoke when the environment provides
Firefox. Distribution signing and store publication remain future work.

## Rejected alternatives

Reject copying the Chrome output for Edge, forcing an MV3 service worker into
Firefox, maintaining separate domain implementations, adding a second browser
test framework, or expanding permissions for compatibility.
