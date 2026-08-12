# ADR 0010: Organization-Scoped Configuration

## Status

Accepted

## Context

Roo needs a configuration grammar that can describe both a single simple
catalog and independently scoped organization catalogs while preserving the
existing v1 import semantics. The domain must distinguish base accounts from
project destinations and must make account ownership unambiguous before any
future runtime integration.

## Decision

- Config v1 is Simple Mode only.
- Config v2 is either Simple Mode or Organization Mode.
- Mode is determined by top-level shape, not by version.
- `organizations` and `organisations` are accepted as input; `organizations`
  is the only normalized spelling.
- `base_accounts` is a non-empty array. `account_id` is required and
  `account_alias` is optional.
- Multiple base accounts per organization are supported.
- Organization defaults are scoped to that organization's projects.
- Base accounts do not create Jump Targets.
- The same project/environment names are valid in different organizations.
- Account ownership across organizations must be unambiguous.
- A base account ID plus an explicit project account ID in the same organization
  is valid.
- All configs normalize to explicit scopes before resolution.
- Active-organization runtime scoping consumes the on-demand commercial AWS
  Console context boundary defined by ADR 0011 and ADR 0012.

## Consequences

Simple v1 behavior remains available through the existing v1 import boundary.
The pure schema, scope, resolver, and ownership domains can be tested before
runtime integration chooses an active organization. Organization targets are
never flattened into one mixed unscoped catalog.

Base account metadata can identify ownership without creating destinations.
Project declarations remain the sole source of Jump Targets, including when a
project account reuses a same-organization base account ID.
