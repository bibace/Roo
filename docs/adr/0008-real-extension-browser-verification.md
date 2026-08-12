# ADR 0008: Real Extension Browser Verification

## Status

Accepted

## Context

Vitest domain tests and server-rendered component tests cannot prove that the
compiled browser background context, extension runtime messaging, storage
events, Options page, Popup page, and browser navigation work together. A
release gate that omits that path can report success while the installed
extension is blank or mutates the wrong state.

## Decision

Add `@playwright/test` as a development dependency while preserving Vitest for unit and pure-component tests. Chrome-target MV3 and Edge-target MV3 built-extension E2E both run in Playwright Chromium, each against its independently generated WXT artifact (`.output/chrome-mv3` and `.output/edge-mv3`) with an isolated persistent profile. The tests do not claim branded Microsoft Edge execution. Tests must use the real runtime protocol and browser storage, not test hooks, mocks, SSR-only rendering, or a development server.

The suite covers the primary Options and Popup workflows: Add with every field, validation, additional-role editing, stable-ID Edit and Remove, YAML/JSON import, invalid-import last-known-good behavior, Popup search and keyboard/mouse activation, Settings navigation, cross-source collision isolation, two-window stale edits and explicit review/rebase, deleted-record recovery, concurrent mutations, and persisted-data corruption. AWS navigation is asserted structurally and must not require an AWS network request. The fixture launches Playwright's selected Chromium without a machine-specific executable path, uses an isolated profile under the platform `os.tmpdir()`, validates the built extension before launch, bounds service-worker discovery, and removes the profile on success or failure. Linux CI runs the headed extension mode under `xvfb-run` after `npx playwright install --with-deps chromium`.

Real toolbar-action lifecycle assertions use one action attempt and do not
reload, reopen, or retry the Popup to turn a failed first attempt into success.
Firefox automated evidence remains build + strict web-ext lint + package/artifact
verification; Firefox runtime smoke is separate manual evidence and Firefox
Popup/action runtime E2E is not provided by the current Roo harness. Local
`npm run test:release` is the complete developer pre-push gate. GitHub `core`,
`chrome`, `edge`, and `firefox` jobs execute the distributed CI evidence once;
GitHub `release` is only the final aggregation gate and does not repeat
`npm run test:release`. CI pins the Node major, runs `npm ci`, installs Chromium
for the two Chromium target runs, executes unit/typecheck/build/E2E/lint checks,
packages each target, verifies the version and exact manifest permissions,
audits dependencies, and runs `git diff --check`. The supported release version
for this maintenance task is `1.2.0`.

## Consequences

Release evidence includes the compiled extension and its worker, not only source-level behavior. CI takes longer and requires a browser installation, but it detects wiring, runtime, storage, and packaging failures before release.

## Rejected alternatives

Reject treating SSR/component tests as extension E2E, testing only source entrypoints, using extension test hooks to bypass the runtime boundary, or making real-browser verification optional for UI and persistence releases.
