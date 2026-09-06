# OpenSky SDK E2E drafts

**Status: drafted, typechecked and collected; not executed against a desktop.**
There are 14 implemented test bodies (13 successful workflows and one rejection)
and 14 explicitly pending scenarios. A passing typecheck or test listing is not
driver acceptance. Unsupported paste/scroll operations should produce failing
E2E results when these drafts are first run, not passing rejection assertions.

Yes, OpenSky has an SDK: the `opensky-cua` package exports `createOpenSky`,
`createCua`, `OpenSky`, bound app/tab interfaces and configuration types through
its root entry point. These tests import **`opensky-cua`**, resolving its built
package exports; they do not import `src/` or inject a `DriverClient`.

## Tested boundary

The path is **public SDK → real installed Cua Driver → real browser/native app →
public AX state, the app's HTTP backend, or a saved document**. This is SDK E2E
coverage, not a test of a separate UI built on the SDK, and not model evaluation.

The requested [testing skill](../../../../../../Projects/saffron-health/halo-v2/.agents/skills/testing/SKILL.md)
calls for real consumer workflows, no mocks, distinct assertion ownership and
fixture-managed isolation. These are library tests using
[Vitest fixtures](https://vitest.dev/guide/test-context.html#test-extend).
Playwright would be appropriate for testing an SDK consumer's UI; driving the
desktop through Playwright here would bypass the SDK boundary under test.

Each test owns one behavior. Fixture setup supplies a unique local HTTP page or
an existing temporary TextEdit document. Scenario SDK actions and their assertions
remain in each test. The page's backend is real: it receives browser DOM-event
reports and does not return synthetic SDK/driver responses. Helpers only resolve
indices from public state, prepare test inputs and manage lifecycle.

In-app browsers, Codex handoff/deliverable marks and other Codex host features
are **out of scope**. Hidden standalone browser support is not inferred from
Codex's in-app browser and is not part of this acceptance suite.

## Files

- [Browser workflows](specs/browser-success.test.ts): paste text/HTML/Markdown,
  trusted coordinate scroll, per-match context in three collection shapes,
  Unicode/punctuation fidelity and fresh observations after late content.
- [Native workflows](specs/native-success.test.ts): real multiline paste and
  three disambiguated text-selection/cursor workflows in TextEdit.
- [Rejection supplement](specs/browser-rejections.test.ts): obsolete control
  references cannot act on a different control.
- [Pending cases](specs/needs-real-fixture.todo.test.ts) and
  [scenario contracts](scenarios.md): clipboard races, profiles, Finder, WebKit,
  range controls, save sheets and transport failures needing real prerequisites.
- [SDK fixtures](fixtures/sdk.ts), [test page](fixtures/site.ts) and
  [serial configuration](vitest.config.ts).

## Prepare and inspect without GUI execution

From the OpenSky repository root:

```sh
npm ci
npm run build
cd e2e
npm install --ignore-scripts
npm run typecheck
npm run list
```

The E2E package is separate from the existing Node test suite; this draft does
not migrate or replace that suite. Vitest is pinned to 4.1.11. Listing tests does
not instantiate the lazy desktop fixtures. Vitest's default list omits TODO cases;
their declarations and prerequisites remain visible in the files above.

## Later real-driver execution

On a provisioned **disposable desktop**, with an already running, permissioned
helper and standalone Chrome (or Edge), run from `e2e/`:

```sh
OPENSKY_REAL_DRIVER=1 \
CUA_DRIVER_BINARY=/absolute/path/to/cua-driver \
npm test -- specs/browser-success.test.ts
```

Run native cases separately on macOS with TextEdit installed. Select Edge with
`OPENSKY_E2E_BROWSER=edge`. Use the same browser cases on separately provisioned
Windows and Linux desktops; do not force `target:"mac"` to simulate a platform.

The fixtures disable driver auto-install/start. They create isolated SDK-owned
tabs, save native edits only to their own temporary file, and close exact owned
targets. They do not click permission prompts or unexpected Save As sheets.
SDK recovery directories are retained for inspection, including when another
fixture fails during teardown. Cleanup errors fail the run; retries and file parallelism are disabled, with
`bail:1`. Preserve recovery files after failed cleanup and inspect before the next
run. Do not open unrelated apps/tabs or run two suites against the same desktop.

Record SDK commit/package version, helper build, OS/browser versions, selected
case names and real teardown outcomes with each acceptance report. Missing
prerequisites are not product passes. Tests should not catch an unavailable
capability and convert it to `skip`, `todo`, `test.fails`, or success dynamically.
The statically declared TODOs require a deliberate implementation step first.

## Current validation

TypeScript checks all fixtures/specs against the existing built SDK, and Vitest
collects all 14 implemented cases. Inline page scripts were syntax-checked.
No E2E body was run, and no driver or production SDK code was changed in this pass.
The native AX role resolver and all live timing/cleanup assumptions still need
their first real-driver run. HTTP polling waits only for observations; it never
retries SDK actions. The late-content case waits for the actual page's completion
signal, so it establishes freshness after completion, not a general page-readiness
or latency guarantee.
