# opensky

REPL cells preserve top-level variable, function, and class declarations across
calls. Top-level variables are mutable session bindings, including declarations
written with `const`, and may be redeclared in later cells. Direct top-level
redeclarations, assignments, and updates of a binding previously declared with
`const` emit an advisory warning before cell output; the assignment still runs.
These warnings analyze direct cell expressions, not deferred callbacks or
control-flow bodies, and do not predict which branch of an expression executes.
Mutating an object's properties does not replace its binding. Nested blocks and
functions retain JavaScript lexical scope. `globalThis` and `__openskyLogs` are
reserved declaration names. Screenshot bytes printed to the strict evaluator's
console are summarized; observation methods attach the image directly.

`opensky` is an open computer-use library, async Node REPL, and agent skill backed by [Cua Driver](https://cua.ai/cua-driver) (`cua-driver call …`). It includes a native-style `cua` facade and preserves the original flat `opensky` API. The facade intentionally reports unsupported operations instead of claiming complete `@oai/sky` coverage.

Harness development is tracked in the [friction and fixes ledger](docs/harness-friction.md)
and the concise, cross-domain [harness principles](docs/harness-principles.md).

```js
import { createOpenSky } from "opensky-cua";

const opensky = createOpenSky();
const apps = await opensky.list_apps();
const before = await opensky.get_app_state({ app: "Calculator", disableDiff: true });
await opensky.click({ app: "Calculator", element_index: 13 });
const after = await opensky.get_app_state({ app: "Calculator" });
await opensky.close();
```

## Install

```bash
npm install -g opensky-cua
opensky doctor
```

If the helper runs on a non-default or sandbox-exposed socket, set
`CUA_DRIVER_SOCKET=/path/to/cua-driver.sock` or pass `--socket <path>`.

For a custom helper, set `CUA_DRIVER_BINARY=/absolute/path/to/helper` (legacy
aliases: `CUA_DRIVER_PATH`, then `OPENSKY_DRIVER`). An explicit `--driver` wins
over environment overrides. An invalid explicit path fails without installing
or selecting a different helper. On macOS, OpenSky resolves the helper's app
from the executable's bundle ancestry; `CUA_DRIVER_APP_PATH` can specify it.

`opensky doctor` downloads the native desktop helper if needed and starts it. On macOS, System Settings will ask for **Accessibility** and **Screen Recording**. Enable both for the helper app that appears (it may be labeled CuaDriver), then run `opensky doctor` again.

From this repo instead of npm:

```bash
npm install
npm run build
node dist/cli.js doctor
```

## Add / install the skill

The skill lives at [`skills/opensky/SKILL.md`](skills/opensky/SKILL.md). Agents load it from `.agents/skills`, `.cursor/skills`, `.claude/skills`, or `.codex/skills`.

### Agent Skills CLI (`npx skills add`)

From a checkout of this project:

```bash
# project-level (committed with the repo)
npx skills add . --skill opensky -a cursor -a claude-code -a copilot -y

# user-level (every project on this machine)
npx skills add . --skill opensky -g -y
```

After the repo is on GitHub:

```bash
npx skills add tanishqkancharla/opensky --skill opensky -g -y
```

List without installing:

```bash
npx skills add . --list
```

### `opensky skill add` / `opensky skill install`

Copies `skills/opensky` into the local agent directories:

```bash
# project: ./.agents/skills/opensky, ./.cursor/skills/opensky, ...
opensky skill add
opensky skill install

# user: ~/.agents/skills/opensky, ~/.cursor/skills/opensky, ...
opensky skill install --global
opensky skill add -g
```

`skill add` is an alias for `skill install`.

Manual copy:

```bash
mkdir -p .cursor/skills
cp -R skills/opensky .cursor/skills/opensky
```

Then start a new agent session (or `/opensky`) so the skill is picked up.

## Usage

```bash
opensky                  # interactive async REPL  (prompt: opensky>)
opensky eval 'await opensky.list_apps()'
opensky eval --json 'return await opensky.get_app_state({app:"Calculator", disableDiff:true})'
opensky run script.js
opensky serve            # persist context across evals (token in OPENSKY_HOME/repl.json)
opensky stop
opensky doctor
```

The REPL evaluates each snippet as an async function body, so `await` works. A single expression is returned automatically; otherwise `return` the value you want printed. `Date`, `Number`, and other standard JS globals are in scope.

`opensky serve` binds 127.0.0.1 and requires the token stored in `repl.json` (mode 0600). It omits direct `process` and `require` globals, but it is intended only for trusted local snippets and is not a security boundary. `OPENSKY_HOME` (default `~/.opensky`) is created mode 0700; `session.json` is mode 0600.

## Native-style `cua` facade

The package exports `cua` for the singleton lifecycle and `createCua(opensky)` for an explicitly owned lifecycle. The CLI REPL preloads both `cua` and the legacy `opensky` object.

```js
const app = await cua.getApp("Calculator");
console.log(await app.getAXState());
await app.click(13);

const tab = await cua.createBrowserTab("chrome", "https://example.com");
await tab.goto("https://example.com/about");
console.log(await tab.getAXState());
await tab.close();

const browser = await cua.getBrowser({ id: "chrome" });
await browser.nameSession("research");
const blank = await browser.tabs.new();
await blank.goto("https://example.com");
await blank.close();
```

The facade provides camelCase, bound-target methods: `getState`, `listApps`, `getApp`, `listBrowsers`, `listTabs`, `getBrowser`, `createBrowserTab`, and `getTab`; current native-style `browser.tabs.new/get/list/selected` and `browser.nameSession`; target observations and actions; and exact-tab `goto`, `back`, `forward`, `reload`, and `close`. `getAXState()` is AX-only by default, `getScreenshot()` returns screenshot bytes, and `getAXStateAndScreenshot()` returns both. `disableDiffing` maps to the driver's diff control. As a generic OpenSky extension, facade observations also accept `query` to return a fresh semantic view narrowed to matching page content.

Queried state contains matching content only: surrounding labels and page-wide ordering may be omitted, even when the filtered result is complete. Omit `query` when interpreting context or comparing order across the page. Coordinates use screenshot-pixel tuples (`[x, y]`), not objects: `tab.click([x, y])`, `tab.scroll([x, y], "down", 1)`, and `tab.drag([fromX, fromY], [toX, toY])`. Browser coordinate input requires a fresh screenshot of that exact tab; an AX-only observation does not provide a mapping. Prefer fresh semantic indices when available.

Browser outlines retain the driver's source indentation, named/stateful containers,
and repeated labels. Only bare unnamed `generic` containers are abbreviated as
`-`, with an inline legend; these placeholders are not action refs. The outline
has a 10,000-character whole-line prefix budget, and the separate ranked action
list has an 8,000-character/120-entry budget (coverage text and headings are
additional). A rendering omission is explicitly partial even if driver collection
was complete. Action-list order is not page order. This renderer cannot recover
context omitted by the driver, or infer exact relationships from duplicate labels.

`getState()` labels its browser inventory with `tabInventoryScope: "facade-owned-only"`. An empty inventory means no facade-owned tabs were observed; it does not establish that the user has no pre-existing tabs or windows.

Browser-provider discovery uses the installed app catalog, so `getBrowser()` works in a clean session before OpenSky has created a tab. `browser.tabs.new()` creates an exact blank tab; the top-level `createBrowserTab(browser, url)` shortcut remains the efficient known-URL path. `nameSession()` labels future unique owned driver sessions. Tab discovery remains deliberately limited to exact tabs created by this facade; it does not enumerate or close user-owned tabs. Because each owned tab is an isolated browser session, `selected()` returns a tab only when exactly one live owned candidate exists and otherwise returns `undefined` instead of guessing. A URL hint retains affinity with an exact facade-owned tab at that URL; otherwise Chrome is preferred and Edge is the fallback. The in-app browser, hidden tab creation, clipboard paste, optional browser capabilities, and host metadata methods (`markDeliverable`/`markHandoff` without callbacks) throw typed `CuaUnsupportedError`s or are unavailable. Paste currently fails closed for every target before touching the global clipboard because Cua Driver does not yet provide the compound primitive needed to restore safely around concurrent user clipboard changes.

## Legacy `opensky` API

The original snake_case, app-argument API remains available for backward compatibility:

| Method | Cua Driver tools used |
| --- | --- |
| `list_apps()` | `list_apps` |
| `get_app_state({app, disableDiff?, includeScreenshot?, includeAppChrome?, query?})` | Typed `get_browser_state` for an exact Chromium target/tab; `query` narrows a large page to matching semantic content/current refs. Otherwise uses `launch_app` if needed, `list_windows`, `get_window_state` |
| `open_target({app, targets, includeScreenshot?, query?})` | For one HTTP(S) URL in Chrome/Edge/Chromium, prepares an isolated profile, binds the exact target/tab, navigates, and returns `semantic_v2`; `query` narrows that initial exact-browser observation. On macOS, native targets request a fresh app instance and bind only after proving a new pid with one uniquely revalidated ordinary window |
| `navigate({app, url | action, includeScreenshot?, query?})` | Navigates an exact driver-owned typed tab to a URL or performs exact-tab back, forward, or reload, then returns settled state |
| `close_target({app})` | Closes one exact driver-owned browser target or proven-owned macOS native window; refuses to close ordinary user-owned app/window/tab state |
| `bring_to_front({app})` | `bring_to_front` with the exact bound window |
| `click` | Native `click` / `double_click`; exact tabs use a semantic ref or fresh screenshot coordinates with proven pixel-to-CSS metadata |
| `drag` | Native `drag`; exact tabs use semantic `browser_pointer` drag or screenshot coordinates only with proven pixel-to-CSS metadata |
| `paste` | Temporarily fails closed before touching the global clipboard; safe paste needs a compound driver primitive |
| `perform_secondary_action` | Supported `click` actions (`press`/`show_menu`/`open`/…), `bring_to_front`, or Delete |
| `press_key` | Native `press_key` / `hotkey`; exact tabs use trusted `browser_key` with optional type-capable element targeting |
| `scroll` | Native `scroll`; exact tabs use a semantic scroll ref or fresh screenshot coordinates with proven pixel-to-CSS metadata |
| `select_text` | Element-targeted background Home/arrows (`exact` alias; prefix/suffix disambiguation) |
| `set_value` | `set_value` (including exact slider/stepper values) |
| `type_text` | `type_text` (element, coordinates, or verified focus) |
| `close()` | Ends only driver sessions owned by this OpenSky instance; safe to call repeatedly |

`opensky.target` is `"mac"`, `"win"`, or `"linux"`.

Every state includes a short opaque `targetHandle` (also available as
`state.target.handle` for an explicitly opened resource). Pass that handle as
the existing `app` value to address the exact same window or tab:

```js
const first = await opensky.open_target({ app: "Google Chrome", targets: [firstUrl] });
const second = await opensky.open_target({ app: "Google Chrome", targets: [secondUrl] });
await opensky.click({ app: first.targetHandle, element_index: 4 });
await opensky.close_target({ app: second.targetHandle });
```

Opening another target in the same app does not replace or close its siblings.
The app name remains convenient shorthand for the newest live target; a handle
is exact and an unknown or closed `tgt_…` handle fails before app discovery,
launch, or input. Handles also scope snapshot indices and action settling, so an
index observed from one sibling cannot silently address another.

OpenSky also mirrors the native runtime's ergonomics around helper lifecycle and
observation timing: expired named sessions are revived transparently, state
capture waits briefly after actions, typed browser state is rechecked for semantic
stability with a bounded two-second budget, and helper-reported degraded AX snapshots
are retried for up to four seconds. If the helper still cannot resolve AX for an
off-space or custom-drawn window, `get_app_state` preserves its screenshot and
returns explicit coordinate-fallback guidance instead of a silent empty tree.
Fresh target opens retain the launched document/window identity instead of
silently adopting an older sibling. Exact token-addressed AX actions remain
safe off-Space; only coordinate and ambient input require an on-screen target.
AX output keeps top-level menu-bar context while pruning
closed menu contents, and public element indices remain stable across snapshots
so compact diffs stay useful after the helper renumbers its AX walk. Screenshot
paths are unique per capture, and indexed actions fail fast if the latest
snapshot no longer contains that element; coordinate actions remain available.

## Recommended action loop

```js
const before = await opensky.get_app_state({
  app: "Calculator",
  disableDiff: true,
});

await opensky.click({ app: "Calculator", element_index: 13 });

const after = await opensky.get_app_state({ app: "Calculator" });
console.log(after.text);
```

Element indices are snapshots. Some identifiers fail silently. An action can take effect even if a later screenshot capture rejects. Refresh state before retrying.

Driver refusals throw `OpenSkyError`, retaining an exact structured code when
available and the driver payload in `details`. Projected action results may
provide only an escalation target/reason; OpenSky reports those without inventing
the original cause or switching input routes. Refused actions are not
automatically replayed based on diagnostic text mentioning session recovery.
The exact pre-dispatch `session_ended` admission refusal can revive the client's
own named session once; projected action refusals cannot.
Unknown delivery remains explicit. The default one-shot Cua CLI can omit outer
diagnostic text, so an exact refusal cause is not always recoverable. The opt-in
persistent MCP transport preserves the full driver envelope; it cannot restore
details that the driver itself did not return.

`perform_actions` never retries a completed prefix. If a DOM/UI mutation makes a later element stale, the stopped result includes a fresh settled AX state so the next action can use new indices without a separate observation call.

Evaluator action tools accept `observation_query` to narrow their settled post-action exact-browser state. This composes navigation and discovery without a redundant `get_app_state` call. It is invalid when observation is disabled.

`navigate` similarly combines exact-tab URL, back, forward, or reload navigation
and the settled destination observation in one call. Pass exactly one of `url` or
`action`, and use `query` when the resulting page is large. These operations never
use browser chrome or native keyboard shortcuts. If navigation is acknowledged but
observation fails, OpenSky says that it may have completed and requires observation
before retrying.

Exact-tab `press_key` uses trusted page-scoped CDP input without activating browser
chrome. An optional element index must name a current type-capable semantic ref;
coordinates fail closed. Exact-tab drag accepts either two pointer-capable semantic
indices or screenshot coordinates. Coordinate drag is enabled only after a fresh
browser screenshot supplies an explicit screenshot-pixel to viewport-CSS mapping.
No browser action falls through to native window input.

`paste` is temporarily unavailable for both native and browser targets. The former
clipboard bridge could overwrite a clipboard change made concurrently by the user,
and current driver clipboard formats do not provide the needed atomic contract.
OpenSky fails before target resolution or clipboard access and does not silently
replace paste with typing.

URL targets return page-scoped semantic state by default, omitting restored tabs,
favorites, toolbars, and application menus. Chromium URLs use a driver-owned
isolated profile and exact typed target/tab binding, so they neither reuse nor
close the user's existing tabs. Safe resolved destinations are shown as `url=`
metadata on semantic links when the driver provides them. Long destinations use
an explicitly truncated `urlPreview=` (200 characters); interact through the
element index, not the preview. This keeps long signed or tracking URLs from
crowding useful controls out of the text budget. Use `close_target({app})` when a task explicitly
asks to close that exact target. Call `close()` in a `finally` block when using
the library directly; the CLI, REPL, and server entry points do this
automatically on normal exit or termination.
Each isolated-browser driver session is durably reserved before launch in its
own private record under `OPENSKY_HOME/browser-session-leases/`. Records contain
the exact session name plus a runtime UUID, owner PID, creation time, and transport
ownership; they are published and transferred with same-filesystem atomic renames. Two live
OpenSky runtimes can therefore share a home without reaping or overwriting each
other's cleanup authority. With the CLI transport, a later runtime claims a crash
leftover only when the recorded effective owner PID is demonstrably absent. A new
MCP proxy cannot adopt another proxy's session, even after owner death: its stale
lease and target handles are retained/quarantined for reconciliation. PID reuse and
indeterminate liveness conservatively retain the lease instead of risking a
destructive claim. A failed or ambiguous `end_session` likewise retains the
exact lease for retry. Cleanup requires a structured receipt naming the same
session and reporting `active: false`; otherwise `session_end_unconfirmed`
preserves ownership. Confirmed teardown removes only that session's record. Ordinary
user-owned browser state is never added to this ledger.

For a native macOS target, `open_target` asks LaunchServices for a distinct app
instance and grants close authority only when the launch response proves the
request was dispatched, the returned pid did not exist before the request, the
returned app identity matches, and an independent window inventory contains
exactly one ordinary window with the same id. It does not infer ownership from
a title, reuse an existing process, or adopt a sibling. `close_target` passes
that exact `(pid, window_id)` to Cua Driver's cooperative `close_window`; there
is no keyboard, menu, coordinate, or process-kill fallback. A save/confirmation
sheet, disabled close control, delivery failure, no-op, stale identity, or
unverified response leaves the canonical target and authority intact for an
explicit retry. Only a verified `closed` result removes the target and repoints
the app-name alias to its newest surviving sibling. Other platforms remain
observable but are not granted native close authority until their driver route
can provide equivalent proof.

The version-2 session file migrates older copied app bindings into canonical
target records and alias pointers. Legacy managed-session array entries whose
generated name exposes an owner PID migrate into per-session leases; entries
without enough owner evidence remain recorded but are never granted destructive
cleanup authority. Target/alias/tree persistence in `session.json` is still
last-writer-wins rather than transactional. Concurrent runtimes may safely share
a home for cleanup ownership, but should use separate homes when they need
cross-process target discovery or mutation until per-target leases land.

`open_target` and later observations also return optional structured `target`
identity. It distinguishes the requested resource, exact bound native window,
and current document title/URL when the helper publishes one. Typed Chromium
bindings report a verified tab; legacy native-window URL handling remains
explicitly unverified. A new native window is never reported as a new tab.

If an app is reported running but has no ordinary UI window, `get_app_state` asks the driver to launch/reveal the app before giving up. This matches native `getApp` behavior for background or stale app registrations without guessing a sibling window.

### Opt-in persistent driver transport

`createOpenSky()` still defaults to the one-shot CLI transport. To try the
persistent stdio transport against the existing signed daemon:

```js
const opensky = createOpenSky({
  transport: "mcp",
  driverOptions: { autoInstall: false, autoStart: false },
});
try {
  console.log(await opensky.list_apps());
} finally {
  await opensky.close();
}
```

The equivalent one-shot CLI invocation is
`opensky --no-serve --transport mcp eval 'await opensky.list_apps()'`.
An explicit transport flag refuses to reuse an already-running REPL server;
it does not silently change that server's transport.
Windows/Linux require an explicit `driverOptions.socket` or `CUA_DRIVER_SOCKET`;
OpenSky never switches to a direct, in-process driver to make MCP work.
Cross-platform, crash-recovery, and new-user GUI acceptance remain incomplete,
so this is not a default change or parity claim.

Each instance uses its own base session by default. `close()` immediately rejects
new operations, drains admitted work, ends exact owned sessions, and only then
closes its internally created MCP proxy. Its `transportCloseReceipt` describes
process exit, not independent proof that a target disappeared. If cleanup fails,
retain the home/leases and inspect the error; a retry may finish cleanup, but never
reopens normal operations. The default library drain limit is 30 seconds, tunable
with `drainTimeoutMs`. A drain timeout does not schedule a late finalizer.

An injected `driver` is caller-owned: OpenSky never closes its transport. Close
every consumer before calling `StdioMcpDriverClient.closeTransport()` yourself.
Do not combine injection with `transport` or `driverOptions`. Advanced MCP options
bound calls (30 seconds), queued/admitted work (64), frames (32 MiB), and shutdown;
timeouts, malformed replies, and lost connections quarantine the client without
replaying unknown-delivery calls. Low-level `invoke`/`driver.call` with explicit
session labels are trusted escape hatches, not a sandbox for untrusted consumers.

## Development

Tests and model evaluations run under Node.js with `tsx`, executing TypeScript
source directly. Use Node.js 22.19 or newer for the development/evaluation
toolchain (the Pi SDK requires it).

```bash
npm install
npm test
```

`npm run build` emits the Node-compatible `dist/` used by the published
`opensky` bin. The ordinary CLI REPL also works under Bun. Strict evaluator
mode requires VM microtask draining and checks that capability before admitting
any cell: Bun 1.3.4 ignores that VM option, so it is rejected with a Node.js
recovery instruction instead of risking an uninterruptible Promise loop.
Runaway-loop regressions run in externally bounded child processes so a broken
runtime cannot leave a wedged test process behind.

The evaluator's close operation stops admission of new tool/bridge calls,
drains already-admitted work, and only then cleans up owned targets. An
unsettled action or failed cleanup is not proof of a clean desktop; retain
ownership evidence and retry exact cleanup rather than closing unrelated apps.

The deterministic unit suite uses contract doubles and real-driver-derived
replay tapes so it can run without desktop permissions. Release acceptance is
separate and uses an installed real Cua Driver against live native apps and
websites; `evals/real-driver-smoke.ts` and
`evals/real-driver-browser-task.ts` are the local canaries.

## Evals

Computer-use harness comparison (opensky vs Cua Driver vs Codex Computer Use) lives in [`evals/`](evals/). Each case claims a Cua Fleet VM (or uses an explicitly selected local real driver), runs gpt-5.6-terra, then a judge scores the transcript.

```bash
export FLEETS_TOKEN=...
export OPENAI_API_KEY=...
npm run evals -- --harness opensky,cua-driver,codex
```

Codex Computer Use needs a macOS Fleet image (`CUA_EVAL_OS=macos` and `CUA_EVAL_IMAGE=...`). See [`evals/README.md`](evals/README.md).
