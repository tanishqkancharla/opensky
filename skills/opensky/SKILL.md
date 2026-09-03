---
name: opensky
description: Drive native desktop apps through an async Node REPL whose opensky object matches the OpenAI Computer `@oai/sky` API, implemented on Cua Driver. Use when the user asks to operate, click, type, or automate a GUI application on macOS, Windows, or Linux.
---

# opensky

Use the `opensky` CLI. It is an **async Node REPL** with `opensky` preloaded. Do not call `cua-driver` directly unless `opensky` is unavailable. Do not use `open`, `osascript`, `cliclick`, or focus-stealing GUI scripts.

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

`get_app_state()` launches the app when it is not running.

Prefer display names for actions when a bundle id looks ineffective. Always re-snapshot after an action that seems to no-op, then retry with the other identifier.

## `opensky` API

`opensky` is already in scope. Do not import `@oai/sky`.

```js
opensky.target                    // "mac" | "win" | "linux"

await opensky.list_apps()
await opensky.get_app_state({ app, disableDiff?, includeScreenshot? })
await opensky.bring_to_front({ app })
await opensky.click({ app, element_index?, x?, y?, mouse_button?, click_count? })
await opensky.drag({ app, from_x, from_y, to_x, to_y })
await opensky.paste({ app, text, format?: "text" | "md" | "html" })
await opensky.perform_secondary_action({ app, element_index, action })
await opensky.press_key({ app, key, element_index?, x?, y? })
await opensky.scroll({ app, element_index?, x?, y?, direction, pages? })
await opensky.select_text({ app, element_index, text, prefix?, suffix?, selection_type? })
await opensky.set_value({ app, element_index, value })
await opensky.type_text({ app, text, element_index?, x?, y? })
```

Helpers also in scope: `sleep(ms)`, `state`, `readFile`, `pathToFileURL`.

### `list_apps()`

Returns `{ id, displayName, lastUsedDate, useCount, isRunning }[]`.

`id` is the bundle id when the helper provides one, otherwise the launch path. Kernel/system processes without app metadata are omitted. `lastUsedDate` is unix seconds. `useCount` is included when the helper reports it.

### `get_app_state({ app, disableDiff?, includeScreenshot? })`

Returns `{ app, text, screenshot }`.

- `app` is the launch path when known, otherwise the display name.
- `text` is the accessibility tree for the **main document window**, including menu-bar elements exposed by the helper. With `disableDiff: true` this is always the full tree. Repeated calls without that flag return a compact native-style diff with stable public element indices.
- `screenshot` is `{ url, width?, height?, scale?, format? }` using a `file:` URL, or `null`. Pass `includeScreenshot: false` when AX alone is sufficient. `scale` is `2` for typical Retina captures when the window frame is known.
- Read PNG bytes with `await readFile(pathToFileURL(state.screenshot.url))`.
- OpenSky automatically waits briefly after actions, revives expired helper sessions, and retries temporary degraded AX snapshots. If AX remains unavailable, use coordinates from the returned screenshot or bring the window onto the current desktop and call `get_app_state` again.

### `click`

Prefer `element_index` from the latest `get_app_state().text`. Use `x, y` only for canvas/custom-drawn surfaces.

`mouse_button`: `left` | `right` | `middle` | `l` | `r` | `m` | `0` | `1` | `2`.

### `bring_to_front`

Brings the exact bound ordinary window onto the current desktop. Use it after an off-desktop input refusal, then observe again before addressing elements.

### `press_key`

xdotool-style keys: `"Return"`, ` "super+a"`, `"Up"`, `"KP_0"`. Application-targeted; cannot invoke global OS shortcuts. Prefer a fresh `element_index` for atomic focus+key on sliders and other controls; use `x`/`y` only for custom surfaces.

### `paste`

`format` defaults to `text`; it may also be `md` or `html`. HTML is written to the HTML clipboard plus a plain-text fallback; markdown is written as markdown plus plain text. Unsupported formats are rejected. The previous clipboard is restored after paste.

### `select_text`

`selection_type`: `text` (default), `exact` (alias), `cursor_before`, `cursor_after`. `prefix` / `suffix` disambiguate repeated matches.

### `set_value` vs `type_text`

- `set_value` replaces the whole AX value (multiline safe, does not send Return) and is the preferred exact path for sliders, steppers, and date pickers.
- `type_text` types into a fresh `element_index`, an `x`/`y` field, or the already-verified focused field. Newlines may submit/send.

### `perform_secondary_action`

Copy a supported action name from the latest tree (`Raise`, `Show Menu`, `Press`, `Delete`, app-specific). `Increment` and `Decrement` are not click actions; use `set_value` or an element-targeted arrow key. Do not guess.

### `scroll`

`direction`: `up` | `down` | `left` | `right` or `u` | `d` | `l` | `r`. `pages` defaults to 1.

Prefer `element_index` from the latest tree. You may omit it (or pass `x`/`y`) to scroll the window itself.

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
- Prefer `paste()` for formatted content.
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

`opensky serve` listens on 127.0.0.1 only. Each eval must present the token from `repl.json` (mode 0600). The serve sandbox does not expose `process` or `require`. Session files under `OPENSKY_HOME` (default `~/.opensky`) are created mode 0700/0600.
