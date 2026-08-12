# Roo Configuration Model Specification

## Configuration Boundary

Roo accepts one configuration document per import operation. YAML and JSON MUST
resolve into the same normalized Roo Config version; serialization MUST NOT
change semantic meaning.

## Configuration Versions

The public Configuration authoring contract is:

```text
Config v1 → Simple Mode
Config v2 → Organization Mode
```

The documented Config v2 surface is Organization Mode. Additional parser
compatibility is an implementation detail and is not part of the public
Configuration authoring contract.

In Organization Mode, each organization contains a non-empty `base_accounts`
array and a `projects` map. A base account requires `account_id` and may have an
`account_alias`; multiple base accounts are supported. Input may spell the
organization map `organizations` or `organisations`, but normalized domain
objects use only `organizations`. Organization defaults apply only to that
organization's projects, and base accounts do not create Jump Targets.

Project account IDs and base account ownership MUST be unambiguous across
organizations. A base account ID may also be explicitly declared as a project
account within the same organization, but that project declaration is the only
source of its Jump Targets. The generated project/environment account name
must remain unique within one organization; the same name is valid in different
organizations.

The normalized document is persisted in configuration storage v1. Import and
runtime Workspace boundaries preserve explicit Simple or organization scopes.
Popup selection consumes one resolved organization scope at a time;
Organization Mode never presents all organization scopes as one Popup catalog.

## Canonical YAML Serialization

Canonical YAML is Roo's only editor representation. Upload may accept YAML or
JSON, but every valid document is normalized before being serialized into the
editor. Raw source and comments are not retained.

```yaml
version: 1

defaults:
  enabled: true
  roles:
    - platform/security-readonly
    - platform/security-admin

projects:
  atlas:
    accounts:
      dev: "111111111111"
      prod: "333333333333"
    roles:
      data-engineer:
        environments:
          - prod
```

Organization Mode canonical YAML always uses the public fields:

```yaml
version: 2
organizations:
  engineering:
    base_accounts:
      - account_id: "111111111111"
        account_alias: company-a
    defaults:
      enabled: true
      roles:
        - platform/read-only
    projects: {}
```

`organisations` remains accepted on import, but canonical output always uses
`organizations`. Internal normalized properties `baseAccounts`, `accountId`,
and `accountAlias` never appear as editor syntax.

The equivalent JSON input uses the same public fields and values. Roo checks
and normalizes a draft automatically and persists only the normalized
Configuration after an explicit successful Save. Invalid drafts MUST NOT
replace the current catalog.

Persistence records one source identity independently from canonical editor
syntax. New configuration saves use `created`. Upload saves use `uploaded` with
the validated original local filename, including its YAML or JSON extension.
Editing preserves the current source identity. A later New or Upload save
replaces both the Configuration and its source identity atomically.

`source.kind` is the lifecycle authority independently of the canonical editor
filename. An uploaded file named `roo.yaml` remains uploaded. Clearing is
available only while editing a Created Configuration, transforms the draft to
the canonical minimal valid document, and preserves Created identity when the
user explicitly Saves. Delete is available only for Uploaded identity and
returns Roo to no current Configuration; Roo does not auto-create a default
document.

## Convention Over Configuration

An account belongs to a project, an environment, and an AWS account ID. The
project and environment keys identify the account, while the account value is
its AWS account ID. The default display name is `<project>-<environment>`.

Project and environment identifiers MUST be trimmed during normalization, MUST
contain a non-whitespace character, and MUST NOT contain ASCII control
characters. AWS account IDs MUST contain exactly 12 decimal digits. An account
ID MUST identify only one project/environment account in a normalized
Configuration.

## Default Roles

Roo core defines no built-in IAM roles. When `defaults` is omitted, Roo MUST
normalize it to:

```ts
{
  enabled: false,
  roles: [],
}
```

When a non-empty `defaults.roles` list is supplied and `defaults.enabled` is
omitted, `enabled` MUST normalize to `true`. A configured list is complete and
replaces any previous Configuration defaults. When `defaults.enabled: false`,
Configuration default roles are unavailable even if a role list is present.
Explicitly enabled empty defaults are invalid.

Default roles and explicit Roles MUST use the complete optional IAM path and
final RoleName representation. The complete Roo Console role MUST be at most
64 characters.

## Explicit Roles

The explicit-role object key is the complete IAM role path/name, not only a
display label. Roo MUST derive the short role name from the final path segment.
The `environments` field is optional; when present, every environment MUST
exist in the same project's `accounts` map.

## AWS Console Role Syntax

Roo MUST validate one shared Console role syntax for default roles, explicit
Roles, and runtime navigation. A role MUST be a non-empty string with no
whitespace or ASCII control characters, contain only printable ASCII
characters in each path segment, use non-empty segments separated by `/`, not
start or end with `/`, use a final RoleName matching exactly
`[A-Za-z0-9_+=,.@-]+`, and be at most 64 characters in its complete path/name.

The validator MUST accept other printable ASCII characters in path segments
before the final RoleName, including URL-significant characters such as `?`,
`&`, and `#`. Roo MUST NOT define a general IAM policy engine.

## Flattened Jump Targets

Runtime resolution MUST convert hierarchical Configuration into flat Jump
Targets. Each target MUST retain the validated AWS account ID, generated
account name, complete role path/name, and role short name. Popup MUST consume
Jump Targets and MUST NOT implement role inheritance or Configuration
resolution.

Roo Configuration MUST NOT contain arbitrary navigation URL fields such as
`url`, `href`, `endpoint`, `hostname`, `origin`, `destinationUrl`,
`switchRoleUrl`, `redirect`, or `redirect_uri`.

## Organization Runtime Scoping

Organization ownership includes base account IDs and aliases plus configured
project account IDs. The resolver checks base-login evidence first and uses
current-account evidence when login is unavailable; evidence from different
organizations returns a conflict and Popup fails closed. Unknown ownership is
unresolved.

A fresh ready AWS page context is authoritative. When a same-document refresh
is temporarily unavailable and that tab already has a last-ready sanitized AWS
context, the background retains that context in memory. Loading navigation
invalidates the retained context. Roo does not persist AWS account identity,
active organization runtime state, or an organization fallback cache.

All base accounts inside one organization are equivalent identity anchors.
Matching any configured base account ID or alias MUST resolve the same
organization scope. A base account MUST NOT create a JumpTarget by existing in
`base_accounts`; the same account becomes a destination only when its account
ID is explicitly declared under that organization's `projects.accounts`.
