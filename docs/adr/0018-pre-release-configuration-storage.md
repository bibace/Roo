# ADR 0018: Pre-release Configuration Storage and Source Identity

## Status

Accepted

## Context

Roo has not been released with durable user Configuration data. Its development
history nevertheless accumulated four catalog storage envelopes and migration
paths. Configuration-only convergence removed the second destination source,
so preserving those development-only catalog contracts would add lifecycle
complexity without protecting shipped user data.

The v4 envelope also stored only a canonical editor filename and format. A JSON
upload became canonical YAML before Save, which erased whether the current
Configuration was created in Roo or uploaded and lost the original upload
filename. The next Configuration lifecycle surface needs that identity without
persisting raw source or filesystem access.

## Decision

Roo has one persisted Configuration envelope under
`local:roo-configuration-v1`:

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

The uploaded filename is the validated local basename selected by the user and
must have a supported YAML or JSON extension. It is identity metadata, not a
path, file handle, reload instruction, or retained raw source. Canonical YAML
remains the only editor representation.

New is available only from empty state and saves with `created` identity. It
never overwrites a ready Configuration. Upload from empty state saves with
`uploaded` identity and the original selected filename. A file selected while a
current Configuration exists is a Replace operation, and successful Replace
persists `uploaded` identity with the original selected filename. Edit preserves
the current source identity. All successful saves atomically replace the
normalized Configuration and its identity while retaining the existing
monotonic catalog version and stale-write guard.

Former `roo-catalog-v1` through `roo-catalog-v4` development keys are unknown,
inert storage. Roo does not read, migrate, rewrite, or delete them. This reset
is permitted only because no Configuration storage contract has been released.

## Non-goals

- no Configuration schema change
- no Clear or Delete operation
- no Created or Uploaded lifecycle UI
- no file watching, file handles, paths, or raw-source persistence
- no change to Popup search, AWS context, or navigation

## Consequences

Runtime storage has one strict normalized envelope and no migration fallback.
Created and uploaded Configurations retain stable source identity across Edit,
so lifecycle UX can select the correct later action without inferring identity
from a canonical filename. Old development-profile data remains untouched but
does not affect Roo runtime state or cache invalidation.
