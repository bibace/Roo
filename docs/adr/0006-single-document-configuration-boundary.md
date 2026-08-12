# ADR 0006: Single-Document Configuration Boundary

## Status

Accepted

## Context

Roo is a browser extension for searching and jumping to known AWS destinations. Its configuration boundary MUST stay small and predictable. External authoring workflows can have different maintenance needs, but they MUST NOT make the extension a directory loader, Git client, template compiler, or multi-file merge engine.

## Decision

1. Roo MUST accept one configuration document per import operation.
2. Roo MUST support YAML and JSON serialization.
3. YAML and JSON MUST represent the same versioned Roo Config Schema.
4. Roo MUST normalize both formats into the same internal model.
5. Roo MUST NOT load configuration directories.
6. Roo MUST NOT merge multiple YAML files.
7. Roo MUST NOT implement Git-based configuration discovery.
8. Roo MUST NOT implement template compilation.
9. Future multi-file authoring tooling MUST remain external to Roo.
10. Future external tooling MUST produce one Roo-compatible configuration document.
11. Roo does not depend on the implementation technology of that external tooling.

The Roo repository MUST NOT implement the future external tool, including `roo-template`. A future external tool can maintain many source files and produce one `roo.yaml` or one `roo.json`, but Roo MUST consume only that final document and MUST NOT depend on how it was produced.

The Roo repository does not contain multi-file configuration-authoring infrastructure, Terraform configuration for catalog assembly, Git-based project-template compilation logic, directory or filesystem glob discovery, YAML `include` semantics, or a requirement for users to clone a configuration repository to use Roo.

## Consequences

The import boundary can parse and validate one local YAML or JSON document before normalizing it into the Roo domain model and resolving Jump Targets. The popup remains independent of parsing, schema validation, convention resolution, role applicability, and authoring workflows.

Users do not need to clone a configuration repository, grant broad filesystem access, or rely on directory watching for normal Roo use. Different engineering groups can use different valid Roo documents and default roles without runtime persona or Access Profile logic.

External tooling can evolve independently, as long as its output conforms to the same versioned Roo Config Schema. Roo remains independent of whether that tooling uses any particular language, build system, or infrastructure technology.

## Rejected Alternatives

- Multi-file YAML loading inside the extension.
- Directory watching.
- Git repository loading inside the extension.
- Terraform embedded into the Roo repository.
- Separate semantic schemas for YAML and JSON.
- Runtime Access Profile logic for different engineering groups.
