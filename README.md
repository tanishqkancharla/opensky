# opensky

`opensky` is an open implementation of the OpenAI Computer [`@oai/sky`](https://openai.com) API. It is a **library**, an **async Node REPL**, and an **agent skill**. Under the hood it calls [Cua Driver](https://cua.ai/cua-driver) (`cua-driver call …`) instead of the proprietary `@oai/sky` host module.

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

`opensky doctor` downloads the native desktop helper if needed and starts it. On macOS, System Settings will ask for **Accessibility** and **Screen Recording**. Enable both for the helper app that appears (it may be labeled CuaDriver), then run `opensky doctor` again.

From this repo instead of npm:

```bash
bun install
bun src/cli.ts doctor
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

`opensky serve` binds 127.0.0.1 and requires the token stored in `repl.json` (mode 0600). The serve sandbox does not expose `process` or `require`. `OPENSKY_HOME` (default `~/.opensky`) is created mode 0700; `session.json` is mode 0600.

## `opensky` API

Same method contract as `@oai/sky`, implemented with Cua Driver:

| Method | Cua Driver tools used |
| --- | --- |
| `list_apps()` | `list_apps` |
| `get_app_state({app, disableDiff?, includeScreenshot?, includeAppChrome?})` | Typed `get_browser_state` for an exact Chromium target/tab; otherwise `launch_app` if needed, `list_windows`, `get_window_state` |
| `open_target({app, targets, includeScreenshot?})` | For one HTTP(S) URL in Chrome/Edge/Chromium, prepares an isolated profile, binds the exact target/tab, navigates, and returns `semantic_v2`; other targets use the native app/window route |
| `close_target({app})` | Closes one exact driver-owned browser target; refuses to close ordinary user-owned app/window/tab state |
| `bring_to_front({app})` | `bring_to_front` with the exact bound window |
| `click` | `click` / `double_click` |
| `drag` | `drag` |
| `paste` | `clipboard_read` / `clipboard_write` (text, html, or markdown) + `hotkey` (cmd/ctrl+v), clipboard restored |
| `perform_secondary_action` | Supported `click` actions (`press`/`show_menu`/`open`/…), `bring_to_front`, or Delete |
| `press_key` | `press_key` / `hotkey` (xdotool-style strings) |
| `scroll` | `scroll` (element, coordinates, or the window) |
| `select_text` | Element-targeted background Home/arrows (`exact` alias; prefix/suffix disambiguation) |
| `set_value` | `set_value` (including exact slider/stepper values) |
| `type_text` | `type_text` (element, coordinates, or verified focus) |
| `close()` | Ends only driver sessions owned by this OpenSky instance; safe to call repeatedly |

`opensky.target` is `"mac"`, `"win"`, or `"linux"`.

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

`perform_actions` never retries a completed prefix. If a DOM/UI mutation makes a later element stale, the stopped result includes a fresh settled AX state so the next action can use new indices without a separate observation call.

URL targets return page-scoped semantic state by default, omitting restored tabs,
favorites, toolbars, and application menus. Chromium URLs use a driver-owned
isolated profile and exact typed target/tab binding, so they neither reuse nor
close the user's existing tabs. Use `close_target({app})` when a task explicitly
asks to close that exact target. Call `close()` in a `finally` block when using
the library directly; the CLI, REPL, and server entry points do this
automatically on normal exit or termination.

`open_target` and later observations also return optional structured `target`
identity. It distinguishes the requested resource, exact bound native window,
and current document title/URL when the helper publishes one. Typed Chromium
bindings report a verified tab; legacy native-window URL handling remains
explicitly unverified. A new native window is never reported as a new tab.

If an app is reported running but has no ordinary UI window, `get_app_state` asks the driver to launch/reveal the app before giving up. This matches native `getApp` behavior for background or stale app registrations without guessing a sibling window.

## Development

Tests are TypeScript and run with [Bun](https://bun.sh) (`bun test`), which executes `src/` directly — no `tsc` step required for the suite.

```bash
curl -fsSL https://bun.sh/install | bash
bun test
```

`npm test` is an alias for `bun test`. `npm run build` still emits the Node-compatible `dist/` used by the published `opensky` bin.

The deterministic unit suite uses contract doubles and real-driver-derived
replay tapes so it can run without desktop permissions. Release acceptance is
separate and uses an installed real Cua Driver against live native apps and
websites; `evals/real-driver-smoke.ts` and
`evals/real-driver-browser-task.ts` are the local canaries.

## Evals

Computer-use harness comparison (opensky vs Cua Driver vs Codex Computer Use) lives in [`evals/`](evals/). Each case claims a Cua Fleet VM, runs gpt-5.6-sol, then a judge scores the transcript.

```bash
export FLEETS_TOKEN=...
export OPENAI_API_KEY=...
bun run evals -- --harness opensky,cua-driver,codex
```

Codex Computer Use needs a macOS Fleet image (`CUA_EVAL_OS=macos` and `CUA_EVAL_IMAGE=...`). See [`evals/README.md`](evals/README.md).
