Use desktop.js with the installed native Linux `@oai/sky` API. Initialize once:

```js
globalThis.sky = (await import("@oai/sky")).sky;
```

Observe the actual desktop:

```js
var images = await sky.get_screenshot();
await nodeRepl.emitImage(images[0].data_url);
```

The Linux interface uses desktop screenshot coordinates and the current focus.
There are no app handles or accessibility element indices in this interface.
Use the visible fixture document and fresh screenshots.

- `sky.click({x, y, mouse_button?, click_count?, key?})`
- `sky.press_key({key})` — X keysym chords, e.g. `CTRL+a`, `CTRL+s`, `Return`.
- `sky.type_text({text})` — types into the focused control.
- `sky.scroll({direction, pixels?, x?, y?, key?})`
- `sky.get_screenshot()` — returns screenshot objects with `data_url` and bytes.

Actions do not display a new observation automatically. Observe afterward when
needed to verify the result. Use public calls and variable bindings. Arithmetic, if statements, and
for/for-of/while loops are supported; helper functions remain unavailable. The desktop is disposable, but stay within the assigned app and
document. Do not open other apps, access the filesystem, execute commands,
use macros or the clipboard, or modify evaluation setup. Save the requested
result yourself; the evaluator will only inspect the file you saved.
