# Text input and selection

## Choose the intended operation

| Method | Effect |
| --- | --- |
| `typeText(text)` | Keyboard input into the focused control; newlines can submit/send |
| `setValue(index, value)` | Replace a supported control's entire value; no Return or focus guarantee |
| `selectText(index, text, options)` | Select a live text range or position the caret |
| `pressKey(key, index?)` | Send a key to the focused or explicitly addressed control |
| `paste(text, {format})` | Deliver real clipboard paste to the focused editor |

`setValue` also supports exposed slider/stepper/date values. If a key must commit
that value, target the control explicitly or establish focus first. Keys use
xdotool-style names (`Return`, `Tab`, `Up`, `super+a`); these are application
keys, not global OS shortcuts. On macOS, foreground-dependent input briefly
activates the exact window and then restores the previous foreground app.

Selection options are `prefix`, `suffix`, and
`selectionType: "text" | "cursor_before" | "cursor_after"`.
Use unique context for repeated text. Native Linux/macOS selection requires a
supporting driver and readable live text; macOS also needs writable AX selection.
Ambiguous or unverifiable selection fails without keyboard replay, but a partial
result may have changed the selection. Observe before continuing.

AX can omit selection/caret information. A selected control is not a selected
text range, and a displayed property may describe only the caret or part of the
selection. Verify the intended region through available state or a screenshot.

## Paste capabilities

- **Exact browser tabs:** `text`, `html`, or `md`. Markdown is literal source,
  not rendered formatting. Establish editor focus from fresh state. Paste leaves
  the supplied content on the clipboard.
- **macOS native:** `text`, `html`, or `md` (CommonMark), up to 16 KiB of source,
  with a driver supporting the restore policy and an exact focused control
  exposing readable AX text and selection. AppKit imports HTML; CommonMark
  renders to HTML first. Rich data is RTF plus its plain string (converted
  limits: 64 KiB text, 256 KiB RTF). After verified insertion, supported prior
  clipboard items/formats are restored; observed newer copies are preserved.
  Prior data must be readable and stable, with at most 64 items,128 types per
  item and32 MiB total. Unreadable/oversized snapshots refuse before mutation.
  Unknown input skips restoration and is never replayed. NSPasteboard has no
  atomic compare-and-restore, so its final ownership check/write can still race.
  A completed receipt proves text insertion and a separate preservation outcome,
  not every visual style or saving. Observe rich formatting and verify saving.
- **Linux X11 native:** direct SDK callers query `sdk.get_capabilities()`;
  `app.paste()` checks availability internally. The qualified OpenSky
  driver supports plaintext `native_paste` with explicit foreground delivery,
  clipboard-text-write authority, and an exact focused AT-SPI editable with
  readable text/selection. The payload is placed on the clipboard; prior
  clipboard content is not restored. Tool presence does not establish support
  in every application. If the selected registry lacks `native_paste`,
  `app.paste()` refuses with `unsupported_native_paste` before input or clipboard
  mutation. The SDK never silently substitutes typing.
- **Other native routes:** do not assume paste support.

A paste failure or incomplete receipt can follow actual input. Inspect the text
before retrying; a newer external clipboard copy may be what the app consumed.
Never automatically replay uncertain paste or substitute typing without accounting
for its different events and newline behavior. Verify saving separately when the
task requires a saved document.

## Linux GTK4 focus

GTK4 4.8.3 can omit `Showing` on visible fields and fail accessibility focus.
An `activate` action is not a reliable way to establish text focus. Prefer a
fresh screenshot-coordinate click with `{deliveryMode: "foreground"}` for
these fields, chosen before input; inspect focus before typing. Do not
assume an unconfirmed indexed click worked or automatically replay it through
another route. Hosts needing one-shot capture/session/target guards can use
public `CuaDriverClient.call("click", {pid, window_id, capture_id, x, y,
delivery_mode: "foreground"})` with a fresh capture from the same client/session.
