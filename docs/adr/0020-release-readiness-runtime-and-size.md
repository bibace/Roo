# ADR 0020: Release Readiness Runtime and Package Size

## Status

Accepted

## Context

Roo is preparing for its first public release. The pre-release background
lifecycle disabled the toolbar action whenever a tab entered loading state,
even when the effective URL was a supported commercial AWS Console URL. A
later content-context refresh re-enabled it, which made first-open behavior
depend on AWS context timing.

Popup also inferred Configuration existence from resolved destination count.
That made a valid ready Configuration with zero destinations look identical to
no Configuration. Storage API read failure was likewise reported as malformed
persisted data.

The lazy Configuration editor used the CodeMirror `basicSetup` umbrella. Its
convenient defaults included product-nonessential features and enlarged every
release package. Release verification had no measured ZIP budget and used a
loose 500,000-byte initial Options-entry limit.

## Decision

- The supported AWS URL guard is the sole toolbar action-availability
  authority.
- Loading a supported AWS tab invalidates its prior context while leaving its
  action enabled.
- AWS context readiness controls Popup contents only.
- The first toolbar click after a supported URL commits must open Popup without
  waiting for context readiness or a second click.
- Unsupported or missing URLs keep the action disabled.
- Popup catalog status is derived from `workspace.catalog.status`, never target
  count.
- A ready Simple Configuration with zero destinations displays `No AWS
  destinations configured.`; no Configuration displays `No configuration
  imported.`.
- A ready resolved Organization scope with zero destinations displays `No
  destinations configured for this organization.`.
- Storage read rejection is a typed load failure. Invalid status is reserved
  for successfully read data that fails strict validation.
- CodeMirror `basicSetup` and the `codemirror` umbrella dependency are removed.
- The lazy editor directly composes line numbers, history, default/history/Tab
  keymaps, YAML language and highlighting, indentation, bracket matching,
  selection, active-line support, controlled replacement, accessibility,
  read-only state, and document-change notification.
- Release verification retains lazy-editor checks and owns evidence-derived ZIP
  and initial Options-entry budgets without depending on generated hashes.

## Measured evidence

Execution-time measurements used independently built and zipped version 2.1.0
as the baseline and version 2.1.2 as the converged build.

| Target | Baseline ZIP | Final ZIP | Delta | Final generated total |
| --- | ---: | ---: | ---: | ---: |
| Chrome MV3 | 338,154 B | 308,061 B | -30,093 B (-8.90%) | 956,882 B |
| Edge MV3 | 338,154 B | 308,061 B | -30,093 B (-8.90%) | 956,882 B |
| Firefox MV2 | 338,221 B | 308,138 B | -30,083 B (-8.89%) | 956,995 B |

The initial Options entries remain 90,521 bytes for Chrome/Edge and 90,517
bytes for Firefox. The lazy editor chunk decreased from 425,363 bytes to
329,448 bytes on every target, a 95,915-byte (22.55%) reduction.

The evidence-derived budgets are:

| Target | ZIP budget | Options entry budget |
| --- | ---: | ---: |
| Chrome | 338,944 B | 104,448 B |
| Edge | 338,944 B | 104,448 B |
| Firefox | 339,968 B | 104,448 B |

Each ZIP budget is the final measured ZIP plus 10%, rounded up to 1,024 bytes.
The Options-entry budget is the final measured entry plus 15%, rounded up to
1,024 bytes.

## Consequences

Roo is clickable on the first supported AWS navigation while retaining a
disabled-by-default manifest and unsupported-page protection. Context state and
catalog state now communicate distinct user conditions. Storage outages no
longer accuse persisted data of corruption. Required YAML editing behavior is
preserved with smaller packages, and future size regressions fail release
verification against measured headroom.

## Rejected alternatives

Reject enabling Roo globally, coupling action state to context refresh, using a
second-click test fallback, treating zero destinations as no Configuration,
retaining `basicSetup` solely for unused features, setting a guessed 200 KB
target, or hard-coding generated chunk filenames.
