# ADR 0021: First Public Release

## Status

Accepted

## Context

Roo has not previously been publicly released. Earlier package versions are
unreleased development history rather than published product versions.

## Decision

- Roo 1.0.0 is the first public release baseline.
- The public Configuration authoring surface documents Version 1 — Simple Mode
  and Version 2 — Organization Mode.
- Existing parser compatibility outside the documented authoring surface is
  unchanged in this release and remains an implementation detail.
- Settings contains a lazy Configuration Guide.
- The author is `nova`.
- The repository is `https://github.com/bibace/Roo`.
- Release size budgets established during Release Readiness 1/2 remain frozen.

## Consequences

The one-time reset to 1.0.0 does not downgrade a published Roo release. After
the first public release, the normal semantic-versioning rules apply.
