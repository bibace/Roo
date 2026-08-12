# ADR 0019: Configuration Lifecycle Actions

## Status

Accepted

## Context

Roo persists one normalized Configuration and a source identity that records
whether it was created in Roo or uploaded from a validated local filename.
Canonical YAML is the editor representation for both sources, so a filename
cannot reliably identify their different lifecycle capabilities. In
particular, an uploaded file may itself be named `roo.yaml`.

Roo needs a safe way to empty an existing Created Configuration while keeping
it, and a safe way to remove an Uploaded Configuration from Roo without
implying ownership of the original local file.

## Decision

`source.kind` is the sole Configuration lifecycle authority. Filename equality
never determines lifecycle.

A Created Configuration:

- cannot be deleted;
- can be cleared only inside Edit;
- is cleared by transforming the in-memory draft to the canonical minimal
  valid Configuration;
- is persisted only by the existing explicit `IMPORT_CATALOG` Save; and
- retains `source: { kind: 'created' }`.

An Uploaded Configuration:

- cannot be cleared;
- can be deleted only from the Options summary;
- requires exact confirmation using its original `source.fileName`; and
- remains Uploaded even when `source.fileName` is `roo.yaml`.

Uploaded Delete is a queued `DELETE_CONFIGURATION` operation through
`WorkspaceCoordinator`. The coordinator checks the authoritative ready catalog
token, requires Uploaded source identity, and compares the exact original
filename before the persistence boundary removes only
`local:roo-configuration-v1`.

Delete does not delete or modify the user's local file. Roo retains no path or
file handle. Successful Delete rebuilds a genuine empty Workspace and Roo does
not auto-create a default `roo.yaml`. Former development keys remain unknown
and inert.

## Non-goals

- filesystem deletion
- undo or history
- trash
- multi-configuration management
- remote sync
- auto-save

## Consequences

Created users can explicitly Save an empty but still-present Configuration.
Uploaded users can remove Roo's persisted copy with destructive confirmation.
The same canonical editor filename can safely represent either lifecycle
because source identity, not filename, selects the available operation.
