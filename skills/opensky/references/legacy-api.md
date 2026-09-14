# Legacy SDK: explicit resources and fixed targets

Read this for native file opening, fixed window ownership, or existing snake_case
scripts. Ordinary app/browser interaction uses `cua` as described in the skill.
The CLI preloads `opensky`; direct SDK code obtains it with `createOpenSky()`.
A restricted preloaded host may expose only `cua`; do not assume this API exists.

## Open and close an explicit resource

```js
var opened = await opensky.open_target({app: "App Name", targets: ["/absolute/path/to/document"]});
var handle = opened.targetHandle;
await opensky.get_app_state({app: handle, includeScreenshot: false});
// Actions use this same opaque handle and indices from its current state.
await opensky.close_target({app: handle}); // only after the task permits closing
```

`app` accepts a name, bundle ID, launch path, or returned opaque target handle.
`get_app_state` launches an app if needed. Its default `scope: "window"` stays
with that window; `scope: "app"` follows the active window in the bound process.
Explicit handles remain exact; never fabricate or edit them. The app-name alias
can select the newest target, so keep handles when siblings coexist.

`open_target` accepts files/URLs. A single HTTP(S) URL in a supported Chromium
browser creates an isolated exact tab; use the facade's `createBrowserTab` for
new browser code. On macOS, native opening requests a fresh app process and
requires request-correlated window ownership. When document URL metadata is
available, it identifies the requested document even among sibling windows;
otherwise the supported fallback requires a unique ordinary window. A matching
title alone is insufficient. Missing proof reports `native_target_unproven`;
a process may have launched, so inspect before retrying.

`close_target` closes only an exact owned browser target or proven-owned macOS
native window. Native close is cooperative: a save sheet or unverifiable close
returns an error and preserves the handle for recovery. It never substitutes a
process kill or a guessed shortcut, and refuses ordinary user-owned windows.
Other native platforms do not receive equivalent close authority without proof.

## Method shapes

```js
opensky.target // "mac" | "win" | "linux"
await opensky.list_apps()
await opensky.get_app_state({app, scope?, disableDiff?, includeScreenshot?, includeAppChrome?, query?, context_element_index?, continuation?})
await opensky.open_target({app, targets, includeScreenshot?, query?})
await opensky.navigate({app, url?, action?, includeScreenshot?, query?})
await opensky.close_target({app})
await opensky.bring_to_front({app})
await opensky.click({app, element_index?, x?, y?, mouse_button?, click_count?})
await opensky.drag({app, from_x, from_y, to_x, to_y})
await opensky.drag({app, from_element_index, to_element_index}) // exact browser only
await opensky.press_key({app, key, element_index?, x?, y?})
await opensky.type_text({app, text, element_index?, x?, y?})
await opensky.set_value({app, element_index, value})
await opensky.select_text({app, element_index, text, prefix?, suffix?, selection_type?})
await opensky.paste({app, text, format?})
await opensky.scroll({app, element_index?, x?, y?, direction, pages?})
await opensky.perform_secondary_action({app, element_index, action})
await opensky.close()
```

This is signature notation (`?` means optional), not executable JavaScript.
`navigate` requires exactly one of `url` or `action: "back" | "forward" | "reload"`.
It returns settled destination state. Browser x/y key targeting is unsupported.
Native `scroll` may omit an element to scroll the window. Secondary actions must
come from the current outline; do not guess action names. Text/clipboard behavior
is shared with the [text input reference](text-input.md). Legacy selection also
accepts `"exact"` as an alias for `"text"`.

## Observation and cleanup

State returns `{app, targetHandle, text, screenshot, target?}`.
`screenshot` is null or `{url, width?, height?, scale?, format?}` with a file URL.
`target` distinguishes requested resources, native-window correlation, document
identity, and verified browser tabs. An unverified tab is not an exact tab.
`disableDiff` disables diffing, not capture limits. Browser `context_element_index`
is the facade's `context`; see [browser context](browser.md) for freshness rules.

Direct library users must call `close()` in `finally`. It stops new operations,
drains admitted work and cleans up owned browser sessions. It does not generally
quit native apps. If cleanup fails, retain its error and session records for an
exact retry; do not infer a clean desktop or delete ownership records blindly.
Live runtimes do not reap each other's sessions. Use separate `OPENSKY_HOME`
directories when independent runtimes need persistent target discovery: aliases
in the shared session file remain last-writer-wins.
