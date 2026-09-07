# OpenSky SDK E2E drafts

**Status: two SDK cases executed on hosted Linux; stale-reference regression passes after a driver fix, trusted scrolling remains failing.**
There are 14 implemented test bodies (13 successful workflows and one rejection)
and 14 explicitly pending scenarios. A passing typecheck or test listing is not
driver acceptance. Unsupported paste/scroll operations should produce failing
E2E results when these drafts are first run, not passing rejection assertions.

Yes, OpenSky has an SDK: the `opensky-cua` package exports `createOpenSky`,
`createCua`, `OpenSky`, bound app/tab interfaces and configuration types through
its root entry point. These tests import **`opensky-cua`**, resolving its built
package exports; they do not import `src/` or inject a `DriverClient`.

## Tested boundary

The path is **public SDK → real installed OpenSky Driver → real browser/native app →
public AX state, the app's HTTP backend, or a saved document**. This is SDK E2E
coverage, not a test of a separate UI built on the SDK, and not model evaluation.

The requested [testing skill](../../../../../../Projects/saffron-health/halo-v2/.agents/skills/testing/SKILL.md)
calls for real consumer workflows, no mocks, distinct assertion ownership and
fixture-managed isolation. These are library tests using
[Vitest fixtures](https://vitest.dev/guide/test-context.html#test-extend).
Playwright would be appropriate for testing an SDK consumer's UI; driving the
desktop through Playwright here would bypass the SDK boundary under test.

The test driver should use the same public operations and observations available
to human, agent, and programmatic consumers. Practical configuration (an isolated
home, a selected driver build, serial desktop execution, and explicit permission
mode) is acceptable when documented; it must not substitute a fake service or
make a requested operation succeed only in tests. A page's receipt of an event
alone does not prove the user's intended outcome.

The scroll fixture now redraws actual canvas content. Its assertion locates the
visible document marker in successive SDK screenshots and requires upward movement;
the trusted-wheel receipt is supplementary. The stale-reference fixture replaces
the removed control and exposes visible activation counts for it, its replacement,
a surviving sibling, and the retire action. The assertion checks the fresh SDK
observation for unchanged counts after rejection.

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
npm ci --ignore-scripts
npm run typecheck
npm run list
```

The E2E package is separate from the existing Node test suite; this draft does
not migrate or replace that suite. Vitest is pinned to 4.1.11 and test dependencies are locked. The local `.npmrc`
uses legacy peer resolution to avoid npm's `edgesOut` crash with the nested
`file:..` SDK dependency; it does not alter SDK or driver behavior. Listing tests does
not instantiate the lazy desktop fixtures. Vitest's default list omits TODO cases;
their declarations and prerequisites remain visible in the files above.

## Later real-driver execution

On a provisioned **disposable desktop**, with an already running, permissioned
helper and standalone Chrome (or Edge), run from `e2e/`:

```sh
OPENSKY_REAL_DRIVER=1 \
OPENSKY_DRIVER_BINARY=/absolute/path/to/opensky-driver \
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

TypeScript checks all fixtures/specs against the built SDK, and Vitest
collects all 14 implemented cases. Inline page scripts were syntax-checked.
The initial draft did not run E2E bodies; the first remote results follow below.
The native AX role resolver and all live timing/cleanup assumptions still need
their first real-driver run. HTTP polling waits only for observations; it never
retries SDK actions. The late-content case waits for the actual page's completion
signal, so it establishes freshness after completion, not a general page-readiness
or latency guarantee.


The 2026-09-07 experience-focused revision passed the SDK build, E2E TypeScript
check, fixture-script syntax check, and collection of all 14 implemented cases.
No desktop E2E was executed for that revision. Pixel movement and visible
sibling-isolation assertions still require their first real SDK/driver run.

## Hosted Linux SDK runs

`.github/workflows/sdk-e2e.yml` builds OpenSky Driver from the fork at
`59bdc18e03a276fa98c556f6110ba7791e97d101` and runs SCROLL-B01 and STALE-B01
in separate disposable GitHub-hosted Ubuntu desktops. It uses the public built
SDK, standalone Chrome, Xvfb, a session D-Bus, and a real driver daemon. The runner
selects unrestricted driver permissions and disables Chrome's sandbox because
of the hosted environment; this lane does not establish approval or sandbox
behavior. No GUI process starts on the developer's desktop.

Each case retains driver identity, SDK SHA, browser version, logs, a desktop
recording, public final screenshot/AX diagnostics, and SDK recovery directories
for 14 days. Diagnostics run after the test so they cannot refresh its input
mapping. Tests have no retries and each matrix case owns its VM. Paste remains
an unimplemented SDK capability and is not counted as passing by this lane.
macOS GUI coverage still needs a separately provisioned desktop.

### Additional input-fidelity coverage to adapt

The [CUA first-person movement benchmark](https://github.com/trycua/cua-driver-fps-bench)
is a useful example for held keys, mouse movement and pointer lock with real game
outcomes and recordings. Its agent reads privileged `window.__state` through
JavaScript. For SDK experience acceptance, a future scenario should act and
observe through public SDK screenshots/AX, assert visible progress, and preserve
input diagnostics separately. Its Linux container recipe does not solve macOS
GUI provisioning. No benchmark code or Fleet infrastructure is adopted here.

### First live baseline

[Run 34159847059](https://github.com/tanishqkancharla/opensky/actions/runs/34159847059)
at SDK `a4330d5` / driver `637723da86b3ea42aadf9e12047258a4499d361c`
completed both selected cases with real Chrome and exact-tab cleanup:

- SCROLL-B01 failed before input: trusted standalone input is unavailable on
  Linux under the driver's background-delivery contract. No movement acceptance.
- STALE-B01 failed: the removed button's handler still ran; the retained public
  AX observation showed `Discarded: 1`. The fork now checks attachment atomically
  with DOM click dispatch; the workflow is pinned to that candidate for rerun.

Recordings and public final observations are in the per-case run artifacts.
The eight other implemented browser cases and four native cases remain unrun
in this SDK lane. Filtered-out cases are not passing acceptance evidence.

### Corrected-build result

[Run 34160341420](https://github.com/tanishqkancharla/opensky/actions/runs/34160341420)
at SDK `a6f9fa042a0f03c5bbd9abee8672e77e2d027431` / driver
`59bdc18e03a276fa98c556f6110ba7791e97d101`:

- **STALE-B01 passed**, including the real retire action, stale-click refusal,
  fresh public counts `Discarded: 0; replacement: 0; sibling: 0; retire: 1`,
  and exact owned-tab cleanup. Its recording is 5.4 seconds.
- **SCROLL-B01 failed**, still with `route_unavailable` before trusted delivery.
  The overall workflow remains red, accurately reflecting this capability gap.

The driver's [build/unit matrix](https://github.com/tanishqkancharla/cua/actions/runs/34160289413)
is green on Linux, Windows and macOS at that same driver SHA. This is one live
Linux SDK regression pass, not full driver parity or cross-platform GUI
certification. Documentation-only commits after these SHAs do not change the
tested implementation.
