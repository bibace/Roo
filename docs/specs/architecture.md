# Roo Architecture Specification

## Final v1 Runtime Flow

Options uses the typed Workspace protocol; Popup uses one typed
`GET_POPUP_BOOTSTRAP` request. Each browser background owns one
`WorkspaceCoordinator` queue and is the only production writer:

```text
Persisted Catalog
        ↓
resolve Configuration scopes
        ↓
Workspace targets
        ↓
PopupBootstrap
        ↓
Search / Jump
```

The coordinator also exposes the resolved Configuration scopes to Options.
`WorkspaceSnapshotCache` is background memory only: it optimizes
`GET_WORKSPACE`, never persistence or write authority. Relevant catalog
storage changes invalidate it; a successful import replaces it with a freshly
built `WorkspaceView`. A cache caller never receives a result from a generation
invalidated or replaced before its load completed. Stale in-flight loads and
errors transparently converge on the current ready value or current-generation
load.

Options prepares canonical YAML drafts, but the coordinator re-parses and
re-validates the source before persistence. Popup and Options never mutate
storage directly. Reads wait behind queued writes. Every Configuration import
uses a fresh persisted catalog token, and stale writes fail without replacing
newer state.

The initial Options surface is lightweight. Configuration draft preparation,
canonical serialization, schema/parser tooling, and CodeMirror load only after
the user requests a New, Upload, Replace, or Edit session; CodeMirror is not
part of the initial Options entry. Editor source changes use 200 ms debounced
validation for presentation, while Save independently and synchronously
validates the exact submitted source before sending it to the coordinator.
Release verification preserves that split and enforces measured, target-specific
ZIP budgets plus a measured initial Options-entry budget. The lazy CodeMirror
setup includes only required YAML editing behavior.

Settings navigation from Popup MUST call `browser.runtime.openOptionsPage()`
through one focused browser integration boundary. Options owns local file
selection, candidate preparation, canonical YAML editing, and explicit Save.
The coordinator owns domain validation and persistence. React MUST NOT resolve
catalogs, construct AWS URLs, or access storage directly.

Background resolves Popup mode and organization before returning only
`PopupBootstrap`, never `WorkspaceView`. Popup owns status/statistics
presentation, search, selection, browser activation, AWS destination errors,
and Settings navigation.

## Workspace Model

`WorkspaceView` contains one catalog status and one target model:

```ts
interface WorkspaceOrganizationScope {
  organizationId: string;
  status: WorkspaceStatus;
  targets: JumpTarget[];
  summary: JumpTargetSummary;
}

interface WorkspaceView {
  status: WorkspaceStatus;
  mode: RooConfigMode;
  catalogToken: CatalogMutationToken;
  catalog: {
    status: CatalogSourceStatus;
    source?:
      | { kind: 'created' }
      | { kind: 'uploaded'; fileName: string };
    catalogVersion?: number;
    summary?: CatalogSummary;
    config?: RooConfigDocument;
    scopes: ResolvedCatalogScope[];
  };
  targets: JumpTarget[];
  summary: JumpTargetSummary;
  organizations: WorkspaceOrganizationScope[];
}
```

For Simple Mode, `targets` is the resolved Simple scope. For Organization
Mode, each configured organization has an independently resolved `targets`
array; the top-level array is the deterministic concatenation used for
Workspace statistics. Popup selects one organization before Search.

An empty catalog produces an empty Simple Workspace with no targets. Invalid
persisted Configuration state produces an invalid Simple Workspace with no
targets. A ready Configuration with no resolved targets is empty.

## AWS Console Tab Lifecycle

Roo has one isolated AWS Console tab lifecycle:

```text
supported AWS URL
        ↓
per-tab Roo action enabled
        ↓
AWS-matched content lifecycle
        ↓
background last-ready tab context
        ↓
generation ordering
        ↓
ready context → best-effort Workspace cache warm
        ↓
Popup → GET_POPUP_BOOTSTRAP → organization resolution → Search
```

The supported URL guard is the only toolbar action-availability authority.
Loading a supported AWS URL invalidates the previous tab context but leaves the
action enabled. An unavailable context can change Popup contents but cannot
disable the action. Unsupported or missing URLs disable the action.

The URL guard accepts only the supported commercial AWS Console hosts over
HTTPS without URL credentials. One static content lifecycle is installed only
on the four supported commercial match patterns. It signals page lifecycle
events and does not read page data. The background reads the existing
MAIN-world snapshot with the existing ISOLATED fallback, normalizes it, and
keeps only one last-ready sanitized account/session-mode context per tab in
memory. Temporary same-document unavailable results retain that context;
loading navigation invalidates it, and tab removal deletes it. The generation
never crosses the runtime protocol and the store is not written to storage.

Simple Mode does not probe AWS context. Organization Mode consumes the cached
or fresh probe. Fresh page context remains authoritative, base-login evidence
precedes current-account evidence, conflicts fail closed, and no organization
fallback state is persisted.

## Configuration Boundary

Configuration versions normalize into explicit scopes before catalog
resolution:

```text
Config v1 / Config v2
        ↓
normalized RooConfigDocument + RooConfigScope[]
        ↓
scope resolver
        ↓
scoped JumpTargets
```

Roo owns exactly one current Configuration. Upload accepts one local YAML or
JSON document. New and Edit enter the same canonical YAML editor. Parsing and
schema checking complete before Configuration enters the normalized domain
layer.

```text
Upload YAML / JSON
        ↓
parser → normalize RooConfigDocument
        ↓
canonical YAML editor
        ↓
IMPORT_CATALOG
        ↓
WorkspaceCoordinator
        ↓
local:roo-configuration-v1
        ↓
Workspace rebuild
```

Editor drafts exist only in Options memory. Raw source is not a persistence
boundary. Only a successful explicit Save replaces the persisted Configuration
and source identity. A created source always uses the canonical editor filename
`roo.yaml`. An uploaded source retains its original upload filename as identity,
and its canonical YAML editor filename is derived from that original filename.
`WorkspaceCoordinator` rejects disagreement between source identity and editor
filename before persistence.

Configuration lifecycle authority is `source.kind`; a filename is never
lifecycle authority. Created Clear and Uploaded Delete use distinct boundaries:

```text
Created Clear
        ↓
in-memory canonical draft transformation
        ↓
explicit existing IMPORT_CATALOG Save
        ↓
source remains created

Uploaded Delete
        ↓
DELETE_CONFIGURATION
        ↓
WorkspaceCoordinator mutation queue
        ↓
authoritative ready-token + uploaded source + exact original filename checks
        ↓
remove local:roo-configuration-v1
        ↓
rebuild and cache an empty Workspace
```

Clear never writes before Save. Delete removes no local file and creates no
default Configuration.

File selection uses a generation guard so stale reads cannot replace newer
draft state. If Save is stale, Options preserves the draft, refreshes the
Workspace, and requires explicit `Review latest` before adopting the latest
catalog token. Roo does not watch files or retain file handles.

## Configuration Storage Boundary

The current Configuration storage boundary persists exactly:

```ts
interface PersistedConfigurationV1 {
  storageVersion: 1;
  catalogVersion: number;
  source:
    | { kind: 'created' }
    | { kind: 'uploaded'; fileName: string };
  config: RooConfigDocument;
}
```

Saves write only `local:roo-configuration-v1`, incrementing `catalogVersion`.
New saves use the `created` identity. Upload saves retain the validated original
local YAML/JSON filename under `uploaded`, independently from the canonical YAML
editor filename. Edit preserves the current source identity. New is available
only from empty state. A file selected for a ready or invalid Configuration is a
Replace operation; successful Save replaces both the normalized Configuration
and identity atomically with uploaded identity.

Workspace bootstrap loads and revalidates the strict v1 envelope, source
identity, and complete normalized document and resolves scopes locally. Missing
storage maps to empty, and successfully read malformed data maps to invalid.
Storage API read rejection remains a typed load failure rather than an invalid
Configuration. Former pre-release catalog keys are inert unknown
storage and are not read, migrated, written, or deleted.
Formal Configuration Delete removes only `local:roo-configuration-v1`; former
development keys and former Local Account storage remain unknown and inert.

## Search and Navigation Boundaries

Search is a pure TypeScript boundary that accepts read-only `JumpTarget[]` and
returns matching `JumpTarget[]`. AWS Navigation exposes the pure
`buildAwsSwitchRoleRequest(target: JumpTarget)` boundary, returning only the
fixed endpoint, complete account and role fields, and the derived display name
`${target.accountName} | ${target.accountId}`.

Popup Jump queries exactly one active/current-window tab, requires its numeric
ID and supported commercial AWS Console URL, and executes the one-shot
`submitAwsSwitchRoleInPage` function in MAIN world against the tab's top frame.
Controlled Jump failures return safe diagnostic codes, never URLs or session
metadata. A GET prefill page or second-tab navigation is not a Roo Jump
mechanism.

## Excluded Runtime Architecture

Roo v1 MUST NOT implement remote catalog loading, automatic refresh, backend
services, databases, catalog networking, directory scanning, multi-file
merging, Git loading, template compilation, Terraform, unrelated content
scripts, AWS SDK workflows, STS, AWS APIs, or credential handling. The local
background coordinator is allowed only within the documented single-writer
and cache boundaries.
