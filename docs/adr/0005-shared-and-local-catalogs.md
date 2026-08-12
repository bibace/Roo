# ADR 0005: Shared and Local Catalogs

## Status

Accepted

## Context

Company-wide destinations and user-specific exceptions have different ownership and maintenance needs. The ownership distinction is useful, but it MUST NOT turn Roo's local import boundary into a multi-file loader or make normal navigation depend on repository tooling.

## Decision

Retain Shared Company Catalog and Local User Catalog as ownership concepts. Shared catalog data is read-only in normal Roo account-management UI, and Local User Catalog data is editable by future scoped product work. Each Roo import operation MUST accept exactly one user-selected YAML or JSON configuration document, and any data entering Roo MUST conform to the same versioned Roo Config Schema and normalize into the same internal model.

Shared-catalog distribution and external YAML maintenance remain outside the current local-file import implementation scope. Roo MUST NOT load configuration directories, merge multiple YAML files, ingest Git repositories, compile templates, or require Git operations for the normal workflow. A future external authoring tool can produce one Roo-compatible document, but Roo MUST NOT depend on how it was produced.

## Consequences

Company defaults can be distributed consistently while users retain explicit local additions, provided the Roo boundary receives one compatible document at a time. The popup stays focused on searching and activating resolved destinations rather than editing source catalogs.

## Rejected alternatives

Reject making shared data editable through normal account-management UI, maintaining separate runtime models for shared and local data, loading multiple local documents inside Roo, merging YAML files inside Roo, ingesting Git repositories inside Roo, compiling templates inside Roo, and requiring Git operations for the normal Roo workflow.
