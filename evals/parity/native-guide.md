Use desktop.js with the installed native @oai/sky API. Initialize once:
globalThis.sky = (await import("@oai/sky")).sky;

Supported public method signatures (from the installed Computer Use skill):
- sky.get_app_state({app, disableDiff?}) → {app, text, screenshot: {url} | null}
- sky.click({app, element_index?, x?, y?, mouse_button?, click_count?})
- sky.press_key({app, key})
- sky.type_text({app, text})
- sky.select_text({app, element_index, text, prefix?, suffix?, selection_type?})
- sky.set_value({app, element_index, value})
- sky.scroll({app, element_index?, x?, y?, direction, pages?})
- sky.drag({app, from_x, from_y, to_x, to_y})
- sky.perform_secondary_action({app, element_index, action})

Use app:"org.libreoffice.script" on every call. Keys use xdotool syntax,
for example "super+s", "Return", "Home", "ctrl+Home". Input methods return
no observation. After actions, get fresh state and emit state.text with
nodeRepl.write; use fresh element_index values from that observation.
Do not invent a target:{index} argument: click takes element_index directly.

To inspect a screenshot through the original native screenshot mechanism:
var fs = await import("node:fs/promises");
var { fileURLToPath } = await import("node:url");
var shot = await sky.get_app_state({app:"org.libreoffice.script"});
await nodeRepl.emitImage({bytes: await fs.readFile(fileURLToPath(shot.screenshot.url)), mimeType:"image/jpeg"});

Only the screenshot URL returned by get_app_state may be read from disk.
Do not use filesystem APIs for documents, expected outputs, or anything else.
Use straight-line UI calls and variable bindings; no helper functions or loops.
