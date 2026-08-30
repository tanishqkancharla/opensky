---
name: opensky
description: Drive native desktop apps through an async Node REPL whose sky object matches the OpenAI Computer `@oai/sky` API, implemented on Cua Driver. Use when the user asks to operate, click, type, or automate a GUI application on macOS, Windows, or Linux.
---

# opensky

Use the `opensky` CLI. It is an **async Node REPL** with `sky` preloaded. Do not call `cua-driver` directly unless `opensky` is unavailable. Do not use `open`, `osascript`, `cliclick`, or focus-stealing GUI scripts.

```bash
opensky eval --json 'await sky.list_apps()'
```

`await` works. The last expression is the result. Use `return` for multi-statement snippets.

## Setup check

```bash
opensky doctor
```

If `cuaDriver` is missing, tell the user to install Cua Driver and grant Accessibility + Screen Recording:

```bash
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
open -n -g -a CuaDriver --args serve   # macOS
cua-driver permissions grant
```

## Canonical loop

Refresh state after every action (or a short related group). Element indices are snapshots and go stale when the UI changes.

```js
const before = await sky.get_app_state({
  app: "Calculator",
  disableDiff: true,
});
console.log(before.text);

await sky.click({ app: "Calculator", element_index: 13 });

const after = await sky.get_app_state({ app: "Calculator" });
return after.text;
```

Prefer putting a whole loop in one `opensky eval` so the snapshot stays in-process. For multi-turn work:

```bash
opensky serve
opensky eval 'state.apps = await sky.list_apps()'
opensky eval 'await sky.click({ app: "Calculator", element_index: 13 })'
```

## Targeting apps

`app` may be a display name (`"Calculator"`), bundle id (`"com.apple.calculator"`), or path (`"/System/Applications/Calculator.app"`).

`get_app_state()` launches the app when it is not running.

Prefer display names for actions when a bundle id looks ineffective. Always re-snapshot after an action that seems to no-op, then retry with the other identifier.

## `sky` API

`sky` is already in scope. Do not import `@oai/sky`.

```js
sky.target                    // "mac" | "win" | "linux"

await sky.list_apps()
await sky.get_app_state({ app, disableDiff? })
await sky.click({ app, element_index?, x?, y?, mouse_button?, click_count? })
await sky.drag({ app, from_x, from_y, to_x, to_y })
await sky.paste({ app, text, format: "text" | "md" | "html" })
await sky.perform_secondary_action({ app, element_index, action })
await sky.press_key({ app, key })
await sky.scroll({ app, element_index, direction, pages? })
await sky.select_text({ app, element_index, text, prefix?, suffix?, selection_type? })
await sky.set_value({ app, element_index, value })
await sky.type_text({ app, text })
```

Helpers also in scope: `sleep(ms)`, `state`, `readFile`, `pathToFileURL`.

### `list_apps()`

Returns `{ id, displayName, lastUsedDate, isRunning }[]`.

### `get_app_state({ app, disableDiff? })`

Returns `{ app, text, screenshot }`.

- `text` is the accessibility tree. With `disableDiff: true` this is always the full tree. Repeated calls without that flag may return a diff of added/changed/removed indices plus the full tree.
- `screenshot` is `{ url }` using a `file:` URL, or `null`.
- Read PNG bytes with `await readFile(pathToFileURL(state.screenshot.url))`.

### `click`

Prefer `element_index` from the latest `get_app_state().text`. Use `x, y` only for canvas/custom-drawn surfaces.

`mouse_button`: `left` | `right` | `middle` | `l` | `r` | `m` | `0` | `1` | `2`.

### `press_key`

xdotool-style keys: `"Return"`, ` "super+a"`, `"Up"`, `"KP_0"`. Application-targeted; cannot invoke global OS shortcuts.

### `paste`

`format` must be `text`, `md`, or `html`. The previous clipboard is restored after paste.

### `select_text`

`selection_type`: `text` (default), `cursor_before`, `cursor_after`. `prefix` / `suffix` disambiguate repeated matches.

### `set_value` vs `type_text`

- `set_value` replaces the whole AX value (multiline safe, does not send Return).
- `type_text` types into the focused field. Newlines may submit/send.

### `perform_secondary_action`

Copy the action name from the latest tree (`Raise`, `Show Menu`, `Increment`, `Delete`, app-specific). Do not guess.

### `scroll`

`direction`: `up` | `down` | `left` | `right` or `u` | `d` | `l` | `r`. `pages` defaults to 1.

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
opensky eval --json 'await sky.list_apps()'
opensky eval --json 'return await sky.get_app_state({app:"Calculator", disableDiff:true})'
opensky run script.js
opensky serve          # persist JS + sky snapshot cache across evals
opensky stop
```
