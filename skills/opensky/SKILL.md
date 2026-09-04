---
name: opensky
description: Drive native desktop apps through an async Node REPL with a native-style cua facade and a backward-compatible opensky API, implemented on Cua Driver. Use when the user asks to operate, click, type, or automate a GUI application on macOS, Windows, or Linux.
---

# opensky

Use the `opensky` CLI. It is an **async Node REPL** with native-style `cua` and legacy `opensky` objects preloaded. Do not call `cua-driver` directly unless `opensky` is unavailable. Do not use `open`, `osascript`, `cliclick`, or focus-stealing GUI scripts.

```bash
opensky eval --json 'await opensky.list_apps()'
```

`await` works. The last expression is the result. Use `return` for multi-statement snippets.

## Setup check

```bash
opensky doctor
```

For a helper on an explicit socket, set `CUA_DRIVER_SOCKET` or pass `--socket <path>`.

If `opensky doctor` reports the helper is missing or not running, tell the user to run:

```bash
opensky doctor
```

On macOS they must enable **Accessibility** and **Screen Recording** in System Settings for the helper app that appears (it may be labeled CuaDriver), then run `opensky doctor` again. Do not ask them to install cua-driver separately.

## Canonical loop

Prefer the bound native-style facade:

```js
const app = await cua.getApp("Calculator");
console.log(await app.getAXState());
await app.click(13);
return app.getAXState();
```

The facade exposes exact target objects and camelCase methods. `getAXState()` is AX-only; use `getScreenshot()` or `getAXStateAndScreenshot()` only when needed. Browser tabs created with `cua.createBrowserTab("chrome", url)` support `goto`, `back`, `forward`, `reload`, and exact `close`. Only facade-owned tabs are discoverable. Exact-tab `paste`, blank/hidden tabs, the in-app browser, and host marks are explicitly unsupported.

The legacy API remains available:

Refresh state after every action (or a short related group). Element indices are snapshots and go stale when the UI changes.

```js
const before = await opensky.get_app_state({
  app: "Calculator",
  disableDiff: true,
});
console.log(before.text);

await opensky.click({ app: "Calculator", element_index: 13 });

const after = await opensky.get_app_state({ app: "Calculator" });
return after.text;
```

Prefer putting a whole loop in one `opensky eval` so the snapshot stays in-process. For multi-turn work:

```bash
opensky serve
opensky eval 'state.apps = await opensky.list_apps()'
opensky eval 'await opensky.click({ app: "Calculator", element_index: 13 })'
```

## Targeting apps

`app` may be a display name (`"Calculator"`), bundle id (`"com.apple.calculator"`), or path (`"/System/Applications/Calculator.app"`).

Every returned state has a short opaque `targetHandle`. Pass it as `app` to
keep addressing that exact window or tab. This matters when multiple targets of
one app coexist; the ordinary app name selects the newest live target. Never
edit or guess a handle. Unknown and closed `tgt_…` handles fail closed.

`get_app_state()` launches the app when it is not running.

Prefer display names for actions when a bundle id looks ineffective. Always re-snapshot after an action that seems to no-op, then retry with the other identifier.

## `opensky` API

`opensky` is already in scope. Do not import `@oai/sky`.

```js
opensky.target                    // "mac" | "win" | "linux"

await opensky.list_apps()
await opensky.get_app_state({ app, disableDiff?, includeScreenshot?, includeAppChrome?, query? })
await opensky.open_target({ app, targets, includeScreenshot?, query? })
await opensky.navigate({ app, url?, action?: "back" | "forward" | "reload", includeScreenshot?, query? }) // exactly one of url/action
await opensky.close_target({ app })
await opensky.bring_to_front({ app })
await opensky.click({ app, element_index?, x?, y?, mouse_button?, click_count? })
await opensky.drag({ app, from_x, from_y, to_x, to_y })
await opensky.drag({ app, from_element_index, to_element_index }) // exact typed browser
await opensky.paste({ app, text, format?: "text" | "md" | "html" })
await opensky.perform_secondary_action({ app, element_index, action })
await opensky.press_key({ app, key, element_index?, x?, y? })
await opensky.scroll({ app, element_index?, x?, y?, direction, pages? })
await opensky.select_text({ app, element_index, text, prefix?, suffix?, selection_type? })
await opensky.set_value({ app, element_index, value })
await opensky.type_text({ app, text, element_index?, x?, y? })
await opensky.close()
```

Helpers also in scope: `sleep(ms)`, `state`, `readFile`, `pathToFileURL`.

### `list_apps()`

Returns `{ id, displayName, lastUsedDate, useCount, isRunning }[]`.

`id` is the bundle id when the helper provides one, otherwise the launch path. Kernel/system processes without app metadata are omitted. `lastUsedDate` is unix seconds. `useCount` is included when the helper reports it.

### `get_app_state({ app, disableDiff?, includeScreenshot?, includeAppChrome?, query? })`

Returns `{ app, targetHandle, text, screenshot, target? }`. `target` truthfully separates requested resources, native-window correlation, current AX document identity, and browser-tab verification. For an explicit resource, `target.handle` equals `targetHandle`. Treat `tab.status: "unverified"` literally; a new native window does not prove a new browser tab.

For an exact typed browser on a large page, pass `query` when the outline names a needed item but its action was omitted by the semantic budget. The result is a fresh, narrowed state with current actionable indices; use those indices instead of guessing. Query is read-only and unavailable for native app bindings.
Semantic link entries may include safe resolved `url=` metadata. Use it to understand destinations without unnecessary navigation; continue to act through the opaque current-state element index.

- `app` is the launch path when known, otherwise the display name.
- `text` is the accessibility tree for the **main document window**, including menu-bar elements exposed by the helper. With `disableDiff: true` this is always the full tree. Repeated calls without that flag return a compact native-style diff with stable public element indices.
- `screenshot` is `{ url, width?, height?, scale?, format? }` using a `file:` URL, or `null`. Pass `includeScreenshot: false` when AX alone is sufficient. `scale` is `2` for typical Retina captures when the window frame is known.
- Read PNG bytes with `await readFile(pathToFileURL(state.screenshot.url))`.
- OpenSky automatically waits briefly after actions, rechecks typed browser semantics with a bounded stability budget, revives expired helper sessions, and retries temporary degraded AX snapshots. If AX remains unavailable, use coordinates from the returned screenshot or bring the window onto the current desktop and call `get_app_state` again.

### `open_target({ app, targets, includeScreenshot?, query? })`

Use this as the first call when the task supplies a URL or file. For one HTTP(S) URL in Chrome/Edge/Chromium it creates a driver-owned isolated profile and exact typed tab binding; do not create a blank tab or observe the browser first. URL observations are page-scoped by default so restored tabs, favorites, toolbars, and application menus do not consume context. `includeAppChrome` is unavailable for an exact typed binding and fails closed rather than crossing into native input.

The returned handle remains exact if another target is later opened with the
same app. Use it for actions, navigation, observation, and cleanup whenever
siblings coexist; this needs no selection or switching call.

For that exact typed browser route, pass `query` to make known semantic content addressable in the initial settled observation. Query is rejected before any mutation for native targets, multiple targets, or non-URL targets.

Open files or URLs with a named app and return settled full state. On macOS,
native targets use a fresh app instance and bind only after the driver proves a
new request-correlated pid with exactly one ordinary window. OpenSky never
claims or adopts an existing/title-matched/sibling window as an owned native
target. Prefer the returned opaque handle for every later action.

### `navigate({ app, url | action, includeScreenshot?, query? })`

Navigate the exact driver-owned typed browser tab created by `open_target` and
receive settled destination state in the same call. Pass exactly one of an
HTTP/HTTPS/about `url` or `action: "back" | "forward" | "reload"`. Use this
instead of browser chrome or native shortcuts. `query` can narrow the resulting
page. If acknowledgement succeeds but observation fails, navigation may already
have completed; observe before retrying.

### `close_target({ app })`

Close the exact driver-owned browser target or proven-owned macOS native window
created by `open_target`. Native close is cooperative and exact: it uses the
recorded pid/window id and never falls back to hotkeys, menus, coordinates, or
terminating the app. If a save/confirmation sheet appears or close cannot be
verified, the call fails with its structured recovery code and keeps the handle
available for retry. It refuses ordinary user-owned app, window, and tab state.
Hosts should still call `opensky.close()` as an idempotent browser-session
cleanup fallback.

Isolated browser cleanup is recorded per exact driver session under
`OPENSKY_HOME`. Concurrent live runtimes never reap one another's sessions. A
later runtime may recover a crash leftover only after the recorded owner PID is
demonstrably absent; PID reuse or uncertain liveness intentionally leaks rather
than risking another runtime's browser. Failed cleanup retains the lease for
retry. `session.json` target aliases are still last-writer-wins, so concurrent
runtimes should keep and use their own returned handles rather than relying on
cross-process alias discovery.

### `click`

Prefer `element_index` from the latest `get_app_state().text`. Exact AX element actions are token-bound and remain safe if a user changes focus or Spaces. Use `x, y` only for visible canvas/custom-drawn surfaces.

For an exact typed browser tab, always use `element_index`. Coordinate clicks fail closed so a page screenshot can never silently route into the native window coordinate space. Type directly into a type-capable field; some fields intentionally expose type without click.

If `perform_actions` stops because a UI mutation made a later element stale, it returns the completed prefix plus fresh settled AX state. Derive new indices from that result; do not repeat the completed prefix.

`mouse_button`: `left` | `right` | `middle` | `l` | `r` | `m` | `0` | `1` | `2`.

### `bring_to_front`

Brings the exact bound ordinary window onto the current desktop. Coordinate and ambient input may need this; exact element-targeted AX actions do not.

### `press_key`

xdotool-style keys: `"Return"`, ` "super+a"`, `"Up"`, `"KP_0"`. Application-targeted; cannot invoke global OS shortcuts. Element-targeted chords use background delivery so modifiers are preserved while focus remains isolated; use `x`/`y` only for custom surfaces.

Exact typed browser tabs use trusted page-scoped key delivery. Omit
`element_index` only when page focus is already known, or pass a current
type-capable index to focus that exact field first. Browser x/y key targeting
fails closed and never falls through to native input.

### `paste`

Paste is temporarily unavailable for every target. Safe paste needs a compound
driver primitive that cannot overwrite a concurrent user clipboard change.
The call fails before resolving the target or touching the clipboard, and never
silently substitutes `type_text` because typing and paste semantics differ.

### `drag`

Native targets use screenshot coordinates. Exact typed browser tabs prefer
`from_element_index` and `to_element_index` from the same current semantic
state. Browser coordinate drag is available only from a fresh exact-tab
screenshot whose driver metadata proves the screenshot-pixel to viewport-CSS
mapping; otherwise it fails closed. A browser drag never falls through to a
native window drag.

### `select_text`

`selection_type`: `text` (default), `exact` (alias), `cursor_before`, `cursor_after`. `prefix` / `suffix` disambiguate repeated matches.

### `set_value` vs `type_text`

- `set_value` replaces the whole AX value (multiline safe, does not send Return) and is the preferred exact path for sliders, steppers, and date pickers.
- `type_text` types into a fresh `element_index`, an `x`/`y` field, or the already-verified focused field. Newlines may submit/send.

### `perform_secondary_action`

Copy a supported action name from the latest tree (`Raise`, `Show Menu`, `Press`, `Delete`, app-specific). `Increment` and `Decrement` are not click actions; use `set_value` or an element-targeted arrow key. Do not guess.

### `scroll`

`direction`: `up` | `down` | `left` | `right` or `u` | `d` | `l` | `r`. `pages` defaults to 1.

Prefer `element_index` from the latest tree. For native apps you may omit it (or pass `x`/`y`) to scroll the window itself.

For an exact typed browser tab, OpenSky uses one unambiguous semantic scroll ref. Coordinate scrolling and pages without a driver-exposed scroll ref fail closed; OpenSky never falls through to native window scrolling.

## Confirmation policy

Treat the user's desktop as a real computer. Stop and ask before actions that are hard to undo:

- Deleting files, emptying trash, or overwriting documents
- Sending messages, email, or payments
- Installing or uninstalling software, or changing system settings
- Clicking purchase, submit, publish, or share
- Granting permissions or revealing secrets

Do not click through OS permission prompts, password dialogs, or "are you sure" sheets unless the user already asked for that exact action. Prefer `get_app_state` and describe what you see over guessing.

## Rules

- Prefer element-index actions over coordinates.
- Always derive indices from fresh state.
- Treat action failures as ambiguous until state is refreshed. An action may take effect even if the promise rejects.
- Prefer `set_value()` for exact multiline replacement.
- `paste()` is unavailable; do not substitute typing unless typing semantics are acceptable.
- Avoid newlines in `type_text()` when Return could submit.
- Do not target the agent/IDE itself (Cursor, Codex, Terminal hosting the agent) for safety.

## CLI cheat sheet

```bash
opensky eval --json 'await opensky.list_apps()'
opensky eval --json 'return await opensky.get_app_state({app:"Calculator", disableDiff:true})'
opensky run script.js
opensky serve          # persist JS + opensky snapshot cache across evals (token in ~/.opensky/repl.json)
opensky stop
```

`opensky serve` listens on 127.0.0.1 only. Each eval must present the token from `repl.json` (mode 0600). It omits direct `process` and `require` globals but is for trusted local snippets, not hostile-code isolation. Session files under `OPENSKY_HOME` (default `~/.opensky`) are created mode 0700/0600.
