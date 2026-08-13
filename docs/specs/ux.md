# Roo UX Specification

## Popup

The Popup MUST begin directly with a focused Search input. It MUST NOT display
a visible Roo title, a table header, an instructional footer, or a separate
Jump button.

The Popup MUST render Search immediately and accept typing while bootstrap is
loading. A query entered before bootstrap completes MUST be preserved and
applied to the final targets. The query also survives the `BOOTSTRAP_LOADED`
state transition exactly as typed. Final Organization context failures disable
Search.

Before the user enters 3 characters, Roo MUST NOT display the full result
catalog. At 3 or more characters, Roo MUST perform local matching. Search MUST
NOT require a network request.

The primary workflow is:

```text
Popup
→ focused Search
→ results
→ Highlight
→ Jump
```

Result virtualization is an internal Popup performance implementation. It
limits rendered result rows with fixed row geometry and spacers while
preserving the same Search → Highlight → Jump behavior, result ordering,
pointer selection, keyboard navigation, and Enter activation.

The Popup MUST provide exactly one low-emphasis secondary action labeled
`Settings` after the result/status region. Settings activation MUST use the
browser runtime Options API.

Catalog status messages are:

```text
empty  → No configuration imported.
invalid → Configuration needs attention.
ready  → no catalog-status message
```

A ready Configuration with zero destinations instead displays `No AWS
destinations configured.`. This is distinct from the empty/no-Configuration
message. A resolved Organization scope with zero destinations continues to
display `No destinations configured for this organization.`.

The Popup MUST display one quiet line directly below Search in the form
`<accounts> accounts · <roles> roles`. Accounts means unique AWS account IDs;
Roles means resolved account-role destinations. Simple Mode uses the complete
Simple scope. Organization Mode uses only the selected organization scope.

The Settings action MUST remain visible in every catalog state. Settings
opening failures MUST display `Unable to open Settings.`. AWS destination
failures MUST display `Unable to open AWS destination.`. Changing the query
MUST clear transient Popup errors.

The toolbar action MUST be enabled only on supported commercial AWS Console
tabs. A supported tab whose context is temporarily unavailable MUST still
allow the Popup to open, including while that supported page is loading. URL
support is the only action-availability authority; context readiness controls
Popup content. Simple Mode remains context-independent after the action opens.
Organization Mode consumes the background-owned last-ready sanitized context
and resolves exactly one organization.

A conflict MUST display `AWS account context conflicts with Roo organization
ownership.` and show no results. An unknown account MUST display `Current AWS
account is not assigned to a Roo organization.` and show no results. An
unsupported or non-AWS tab MUST display `Open Roo from a supported AWS Console
tab.`, disable Search, show `0 accounts · 0 roles`, and show no results.

## Configuration

Settings has exactly one functional area:

```text
Configuration
```

Configuration entry actions depend on the current state:

```text
loading:
  no Configuration entry actions

empty:
  New configuration
  Upload YAML / JSON

ready:
  Edit configuration
  Replace file

invalid:
  Replace file
```

A ready Configuration displays its lifecycle identity before its summary:

```text
Created:
  roo.yaml
  Created in Roo
  Edit configuration
  Replace file

Uploaded:
  <original uploaded filename>
  Uploaded
  Edit configuration
  Replace file
  Delete
```

`source.kind` controls this lifecycle. An uploaded file named `roo.yaml`
remains Uploaded and can be deleted; filename equality never makes it Created.

`New configuration` is not an overwrite action. It is available only when no
current Configuration exists. Upload and Replace use one hidden file input
accepting exactly `.yaml,.yml,.json`. After file selection Roo reads, parses,
checks, and normalizes the document, then opens it in a CodeMirror YAML-aware
editor. JSON input converts to canonical YAML.

During initial loading, Settings displays `Loading…`; it MUST NOT display the
empty state before the first Workspace read. A missing Configuration displays
`No configuration imported.`. Invalid persisted data displays `Stored
configuration is invalid. Replace it with a valid YAML or JSON file.`. The
Options document title and H1 remain `Roo Settings`.

Entering a Configuration session displays `Loading configuration editor…`
while the on-demand editor/configuration code loads. After a source change,
the editor displays `Checking configuration…` and disables both `Format YAML`
and `Save configuration` until the current source has completed validation.

The active editor displays its canonical `.yaml` filename, `Canonical YAML`,
and `Uploaded from <original filename>` for every uploaded draft, including a
later Edit. A valid candidate displays
the existing Projects, Accounts, and Roles summary and `Configuration is
valid.`. Schema errors display concise `path` and `message` details. Parser,
file-read, generic validation, storage, and success messages remain
`Unable to parse configuration.`, `Unable to read configuration file.`,
`Configuration is invalid.`, `Unable to save configuration.`, and
`Configuration saved.`.

The standard editor actions are `Format YAML`, `Cancel`, and `Save
configuration`; eligible Created Edit sessions additionally expose the Clear
flow described below. Format is enabled only for valid YAML, canonicalizes only the
in-memory draft, and does not save. Invalid drafts cannot Save. Cancel discards
the complete draft and does not mutate the current catalog. Draft text, editor
state, and raw input MUST NOT be persisted.

Only Edit of a Created Configuration displays `Clear configuration`. Clear
opens an in-editor confirmation explaining that all projects, accounts, and
roles are removed while the Configuration remains in Roo. Confirmation
replaces only the in-memory draft with the canonical minimal valid
Configuration. The user MUST explicitly select `Save configuration` before
that cleared draft is persisted. Uploaded, New, and Replace drafts never
display Clear.

Only an Uploaded Configuration displays Delete, and only on the Settings
summary. Its in-page confirmation requires an exact, case-sensitive match of
the original `source.fileName`; canonical YAML naming is not accepted as an
alias. Delete removes only Roo's persisted Configuration. It does not affect
the original file on the user's computer because Roo retains no path or file
handle. Successful Delete returns Settings and Popup to genuine empty state;
Roo does not create a default Configuration or persisted `roo.yaml`.

The chooser remains unavailable until an authoritative Workspace View has
loaded. It clears its prior input before selection so re-selecting the same
file performs a fresh read. Cancelling the chooser leaves current state
unchanged. Invalid input, a stale asynchronous read, or a failed Save leaves
the current catalog unchanged.

If Save becomes stale, Roo preserves the exact YAML draft and displays
`Configuration changed in another Roo window. Review and try again.`. `Review
latest` explicitly adopts the refreshed catalog token. Save remains disabled
until the reviewed draft is valid. During Save, CodeMirror is read-only and
all Configuration actions are disabled.

If the latest Workspace refresh fails after a stale Save, the draft remains
visible and byte-for-byte unchanged. Settings displays `Configuration changed
in another Roo window.` followed by `Unable to load the latest configuration.
Retry to continue.` and offers `Retry latest configuration`. A successful
refresh transitions to `Review latest`; it does not adopt the token until the
user explicitly reviews it.
