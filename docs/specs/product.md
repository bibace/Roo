# Roo Product Specification

## Core User Outcome

The primary Roo v1 workflow is:

```text
supported AWS Console tab
→ click Roo
→ focused Search
→ type search text
→ matching destinations appear
→ Highlight
→ click or press Enter
→ AWS Console role switch
```

Roo MUST keep Search as the primary Popup interaction. It MUST NOT force users
through project, environment, role, confirmation, persona, or Access Profile
steps.

## Product Principles

- Search first.
- Mouse first.
- Keyboard compatible.
- One row equals one destination.
- Convention over configuration.
- Roo core defines no team-specific IAM roles.
- AWS credentials never enter Roo.
- Common workflows require minimal configuration.
- Exceptions require explicit configuration.
- Internal implementation complexity MUST NOT leak into normal interaction.

## Supported Browsers

| Browser | Manifest |
| --- | --- |
| Google Chrome / Chromium | MV3 |
| Microsoft Edge | MV3 |
| Mozilla Firefox desktop | MV2, Firefox 140+ |

All supported browsers use the same Configuration, search behavior, navigation
contract, and Workspace model. Manifest and background packaging differences
are implementation details only.

Roo supports only the standard commercial AWS partition. Context detection and
the fixed Switch Role navigation boundary use the same commercial-only scope.

Roo's toolbar action is enabled only for supported commercial AWS Console tabs.
The tab URL is the sole action-availability authority: a supported tab remains
clickable while loading and while AWS context is unavailable. Context readiness
controls Popup content, not whether the Popup can open.
Simple Mode remains independent of AWS identity for Workspace selection.
Organization Mode consumes the last-ready sanitized AWS context to resolve its
organization.

Supported AWS tabs establish sanitized tab-scoped AWS context independently of
Popup invocation. Fresh page context is authoritative, base-login evidence
precedes current-account evidence, and conflicting evidence fails closed. A
supported AWS tab keeps only its last-ready sanitized context in background
memory. Temporary same-document read failure does not discard that context;
loading navigation invalidates it. No AWS or organization runtime context is
persisted in browser storage.

## Configuration Boundary

Roo owns exactly one current Configuration. Users can upload one local `.yaml`,
`.yml`, or `.json` document, create a New configuration, or Edit the current
configuration. YAML and JSON MUST be serializations of the same versioned Roo
Config Schema.

Every valid Configuration is normalized and presented as canonical YAML. JSON
is an accepted import format, not an editing format. Raw imported source and
unsaved editor drafts MUST NOT be persisted.

A ready Configuration with zero resolved destinations is still present. Popup
MUST distinguish that state from no Configuration and display `No AWS
destinations configured.` with `0 accounts · 0 roles`.

The Configuration flow is:

```text
Settings
→ New, Upload YAML / JSON, or Edit
→ parse, check, normalize, and resolve
→ canonical YAML editor
→ explicit Save configuration
→ atomically replace the one current catalog through WorkspaceCoordinator
```

Roo MUST persist only the normalized Configuration and its source identity
after a successful explicit Save. The source identity is either created in Roo
or uploaded from one validated local filename. It MUST NOT continuously monitor
a selected file, persist an unrestricted local filesystem path, watch
directories, automatically reload changed files, or require broad local
filesystem access.

Lifecycle actions follow that source identity. A Created Configuration can be
cleared only as an in-memory Edit transformation and requires explicit Save;
its Created identity remains unchanged. An Uploaded Configuration can be
deleted from Roo after exact original-filename confirmation. Delete removes
only Roo's persisted Configuration, never the original local file. Roo retains
no filesystem path or handle and never creates a default Configuration at
startup or after Delete.

## Roo v1 Scope

Roo v1 contains:

- one local YAML/JSON Configuration document per import
- normalized `RooConfigDocument` persistence under configuration storage v1
- Simple and organization-scoped Workspace views without flattening scopes
- convention resolution into flat Jump Targets
- local Search, Highlight, and Jump
- a secondary Popup Settings action
- canonical YAML Configuration creation, upload, editing, and revalidation
- Created Clear and Uploaded Delete Configuration lifecycle actions
- Popup Accounts and Roles statistics from Workspace targets
- fixed, validated AWS Console Switch Role form submission
- one local background coordinator for typed cross-window operations
- one last-ready sanitized AWS tab-context lifecycle in background memory on the
  supported commercial AWS Console hosts

Roo's browser-local storage is independent in each browser profile; Roo does
not synchronize data between Chrome, Edge, and Firefox.

Release verification enforces evidence-derived ZIP and initial Options-entry
size budgets for every supported browser target. The Configuration editor
remains lazy and ships only the required YAML editing capabilities.

Roo v1 MUST NOT contain remote or shared catalog runtime loading, automatic
catalog refresh, multi-file configuration, catalog merge, directory import,
file watching, Git configuration loading, template compilation, Terraform, a
backend, a database, analytics, telemetry, AWS credentials, the AWS SDK, STS,
AWS API calls, arbitrary navigation URLs, or unrelated content scripts. The
background MUST NOT call AWS APIs, credential services, backend services, or
external catalog/network services.

Roo MUST NOT infer a user's occupation, team, job title, or engineering
discipline, and MUST NOT require persona selection during normal operation.
Different role conventions MUST be represented by different valid
Configuration documents.
