# ADR 0002: Convention Over Configuration

## Status

Accepted

## Context

Most Roo accounts follow a predictable project and environment naming scheme and share a small set of roles. Repeating those facts per account would make catalogs noisy and harder to maintain.

## Decision

Roo MUST use `<project>-<environment>` as the generated account name. Default role conventions MUST be configuration-driven rather than permanent Roo behavior. Roo core defines no team-specific built-in roles. Configuration default roles exist only when an imported configuration supplies a non-empty role list and enables it; omitted or disabled defaults resolve to no configuration default roles. Roo MUST accept valid configuration documents with different defaults, including defaults for security or data-engineering use cases.

Projects MUST support explicit project Roles. A project's Role environment scope
is optional; when present, it limits the Role to an explicit list of
environments, and when omitted, it applies to every environment in that
project. The catalog resolver MUST resolve this hierarchy into flat Jump
Targets before the Popup consumes it.

Roo MUST keep common-case configuration minimal and MUST require explicit configuration for exceptions.

## Consequences

Standard accounts need little configuration, role applicability is predictable, and the popup receives one executable destination per row. The catalog resolver owns convention handling; UI code does not.

## Rejected alternatives

Reject verbose per-account role duplication and a generic IAM inheritance or policy-evaluation engine.
