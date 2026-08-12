# Roo - AWS Roles Jumper

## What Roo is

Roo is a browser extension for quickly searching known AWS accounts
and IAM role destinations. Its primary workflow is Search → Highlight → Jump.
Roo core defines no built-in IAM roles; all searchable destinations come from
the one current Configuration.

Roo's toolbar action is enabled only on supported commercial AWS Console tabs.

## Supported browsers

| Browser | Manifest |
| --- | --- |
| Chrome / Chromium | MV3 |
| Microsoft Edge | MV3 |
| Mozilla Firefox desktop | MV2, Firefox 140+ |

Roo supports the standard commercial AWS partition only. Browser profiles
store Roo data separately; Roo does not synchronize data between browsers.

## Quick start

1. Build the target for your browser.
2. Load its output directory as an unpacked extension.
3. Open Roo Settings. Create a New configuration, Upload YAML / JSON, or Edit
   the current configuration. Review canonical YAML and select Save configuration.
4. Open a supported commercial AWS Console tab.
5. Click Roo, search in the Popup, and click a result or press Enter.

Chrome and Edge load `.output/chrome-mv3` or `.output/edge-mv3` from their
extension developer pages. Firefox desktop loads `manifest.json` from
`.output/firefox-mv2` through `about:debugging`.

## Configuration

Roo owns exactly one current local configuration. There is no catalog list,
catalog history, catalog switching, or catalog merge. Configuration entry
points depend on the current lifecycle state:

- Empty: New configuration or Upload YAML / JSON.
- Ready: Edit configuration or Replace file.
- Created: Clear is available inside Edit and requires Save configuration.
- Uploaded: Delete is available from Settings.

Delete removes Roo's persisted copy only. It does not remove the user's
original local file.

YAML and JSON are accepted upload formats. Valid YAML or JSON is normalized
into `RooConfigDocument` and shown as canonical YAML. JSON is an import format,
not an editor format. Raw imported YAML/JSON is not persisted, and uploaded
comments and source formatting are not preserved.

Unsaved drafts are memory-only. Format YAML modifies only the in-memory draft.
Save configuration atomically replaces the one current catalog only after
successful validation. Invalid, cancelled, failed, and stale-unreviewed drafts
do not replace it. Roo has no separate destination store or account editor.

Roo performs no file watching, directory scanning, document merge, Git config,
or remote config loading.

### Version 1 — Simple Mode

```yaml
version: 1
defaults:
  roles:
    - platform/example-readonly
projects:
  atlas:
    accounts:
      dev: "111111111121"
      prod: "111111111122"
    roles:
      platform/data-engineer:
        environments:
          - prod
```

`defaults` is optional. Roo core defines no built-in IAM roles. A role's
`environments` references keys from the same project's `accounts` map. If
`environments` is omitted, that role applies to every account/environment in
the project. An imported account with no applicable role is legal and
contributes zero JumpTargets.

### Version 2 — Organization Mode

```yaml
version: 2

organizations:
  engineering:
    base_accounts:
      - account_id: "111111111111"
        account_alias: engineering-root
      - account_id: "111111111112"
        account_alias: engineering-sso

    defaults:
      roles:
        - platform/example-readonly

    projects:
      atlas:
        accounts:
          dev: "111111111121"
          prod: "111111111122"

        roles:
          platform/data-engineer:
            environments:
              - prod
```

`organizations` and `organisations` are accepted as input; Roo normalizes to
`organizations`. `projects` and organizations are mutually exclusive.
All `base_accounts` inside one organization are equivalent identity anchors:
matching any configured base account ID or alias resolves the same organization
scope and Search corpus. A base account does not become a destination merely by
appearing in `base_accounts`; its account ID must also be explicitly declared
under that organization's `projects.accounts`.

At runtime, Roo resolves:

```text
base login ID/alias → organization
already switched member account → account ownership → same organization
conflicting evidence → fail closed
```

Active organization is per-tab, not browser-global. Unknown or ambiguous
ownership also fails closed, so another organization's targets are not shown.

## Search and Jump

Search is local, case-insensitive, and available after three characters. The
Popup shows `<accounts> accounts · <roles> roles`; each result is one account-
role destination. The normal flow starts from a supported AWS Console tab, whose
tab-scoped context is consumed by Organization Mode. AWS multi-session Console
URLs include a session-specific hostname prefix; Prism removes only the current
session prefix from `redirectUri`, then navigates to the validated destination
returned by AWS.
Legacy submits a transient form POST; Prism submits the session-switch JSON
request. The Popup closes only after the page-local activation path reports
success. Controlled failures keep the Popup open and show a safe diagnostic
code, never session metadata, URLs, credentials, CSRF, or response bodies.

## Region

Roo does not configure an AWS Region. Jump submission derives the display name
as `<project>-<environment> | <account-id>` and does not send a Region field.

## Development and release

```sh
npm install
npm test
npm run typecheck
npm run build:chrome
npm run build:edge
npm run build:firefox
npm run test:e2e:chrome
npm run test:e2e:edge-target
npm run test:release
```

Chrome-target and Edge-target MV3 built-extension E2E run in Playwright Chromium. The Edge-target run loads the independently generated `.output/edge-mv3` artifact and does not claim branded Microsoft Edge automation. Firefox automated release evidence is MV2 build, strict web-ext lint, ZIP, and generated-manifest/artifact verification. Firefox runtime smoke remains a separate manual browser check.

Release artifacts are derived from the package version:

```text
roo-<version>-chrome-mv3.zip
roo-<version>-edge-mv3.zip
roo-<version>-firefox-mv2.zip
```

`<version>` is the current `package.json` version.

## Project

Author: nova

Repository:
https://github.com/bibace/Roo

## Security boundary

The generated named permissions are exactly `storage + scripting`.
The only host access is the exact four-pattern commercial AWS allowlist used by one static
AWS content lifecycle and the background snapshot boundary. `scripting` supports
explicit Popup navigation. Roo reads only
sanitized account identity context, never credentials, from supported AWS
Console tabs. It has no broad host access, cookies, AWS SDK, STS, or network
catalog. Extension contexts do not perform AWS network requests; the only
runtime exception is the explicit user-initiated Prism Switch Role request in
the active AWS Console MAIN world, using the page's existing authenticated
session with `credentials: include`.
