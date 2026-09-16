---
name: opensky
description: Operate desktop apps and browser tabs through OpenSky’s persistent JavaScript REPL on macOS, Linux, or Windows. Use for GUI tasks involving observation, clicking, typing, scrolling, or navigation.
---

# OpenSky

Use the public `cua` API to observe and operate the requested app or browser.
Choose actions from the current UI; this skill contains no application-specific
task recipes.

## Start

When the host provides a preloaded `cua` object through a `cua_repl` tool,
use it directly. Bindings persist between calls; no imports or shell setup are
needed. Start with one of these calls and read the emitted observation before acting:

```js
// The user named an app: name, bundle ID, or path.
var app = await cua.getApp("App Name");

// The user supplied a URL and browser.
var tab = await cua.createBrowserTab("chrome", "https://example.com", {sessionName: "Task"});

// You need to discover available apps, browsers, or live provider tabs.
await cua.getState();
```

Use the user's specified browser (`"chrome"` or `"edge"`). Without a browser
preference, `await cua.getBrowser({url})` selects a provider but does not open a
tab; then use `cua.createBrowserTab(browser.browserId, url)`.
`cua.getTab(id, {browser: browserId})` selects a tab from the observed inventory.
`cua.listTabs()` and `getState()` refresh the live Chrome/Edge provider inventory;
the returned opaque ID can be passed to `cua.getTab`. Create an owned background
tab with `cua.createBrowserTab(browserId, url, {visible: false})`. Discovered user
tabs remain borrowed: `tab.close()` is refused and SDK shutdown detaches without
closing them. Use `cua.attachBrowserTab(browserId, {windowId, providerTabId})`
only when the caller already has exact native/provider identity to bind directly.

For a **CLI host**, keep `opensky serve` running in a separate process, then use:

```sh
opensky eval 'var app = await cua.getApp("App Name"); await app.getAXState()'
opensky eval 'await app.getAXState()'
```

The CLI prints the last expression; the preloaded tool emits observations and
images automatically. Independent CLI calls without a live server do not retain
bindings. See [CLI setup and output](references/cli.md) only when using the CLI.

## Observe and act

`app` and `tab` share these methods. Use an `index` from the latest observation;
coordinates are `[x, y]` in the latest screenshot's pixels, not desktop coordinates.

```js
await app.getAXState()                       // accessibility outline; usually a diff
await app.getAXState({disableDiffing: true})  // full current outline, still bounded
await app.getScreenshot()                    // image only
await app.getAXStateAndScreenshot()          // outline and image

await app.click(index)                       // or click([x, y])
await app.click(index, {mouseButton: "right", clickCount: 1})
await app.typeText("text")                   // focused control
await app.pressKey("super+a")                // focused control; Return, Tab, Up, etc.
await app.pressKey("Return", index)          // explicitly addressed control
await app.setValue(index, "value")           // replace value; does not focus or commit
await app.selectText(index, "text", {prefix: "before", suffix: "after"})
await app.paste("text", {format: "text"})     // real paste into focused editor
await app.scroll(index, "down", 1)           // or scroll([x, y], direction, pages)
await app.drag([fromX, fromY], [toX, toY])
await app.performSecondaryAction(index, "action copied from observation")
```

After an action or short related group, observe again and verify the intended
outcome. App observations follow the active visible window within the bound
process, including dialogs; actions address the latest observed window.
Prefer semantic indices. For canvas/custom UI, inspect a fresh screenshot and
use its coordinates. A later AX-only observation clears screenshot geometry.

Typing sends keyboard input: newlines may submit. `setValue` replaces the value
without sending Return or establishing focus. Establish the intended text range
before replacing a selection; an AX `selected` flag is not a character range.
`selectText` also accepts `selectionType: "cursor_before" | "cursor_after"`.
Repeated matches need unique prefix/suffix context. Native paste requires a
supporting driver, plaintext ≤16 KiB, and verified focus; macOS also requires
readable AX text and selection. Browser/macOS paste leaves clipboard content;
Linux conditionally restores it. See [text input](references/text-input.md) for
platform restrictions or uncertain results.

For tabs, use `goto(url)`, `back()`, `forward()`, `reload()`, and exact `close()`.
Observe after navigation. Large pages support a fresh `getAXState({query: "text"})`;
query is browser-only. Omitted content is not proof of absence. `context` and
`continuation` read stored snapshots, not fresh state: read
[browser context](references/browser.md) before using them.

An error can follow actual input. Observe before retrying; do not replay a
completed action or bypass a refusal with raw driver calls or shell GUI scripts.
Respect existing user authorization for consequential actions. Clean up only
your owned targets; do not interrupt the app/terminal hosting the agent.

## Less common operations

For explicit native file opening, fixed window handles, or existing snake_case
scripts, read the [legacy SDK reference](references/legacy-api.md). Do not assume
an app has `close()` or `openFile()` methods. Unsupported capabilities report an
error; they are not permission to switch targets or input routes.
