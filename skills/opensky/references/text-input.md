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
- **macOS native:** plaintext up to 16 KiB, with a supporting driver and an exact
  focused control exposing readable AX text and selection. Leaves plaintext on
  the clipboard. A completed receipt verifies expected AX text, not that the
  document was saved. Rich text or controls without those AX capabilities are
  unsupported.
- **Linux X11 native:** plaintext up to 16 KiB into the exact observed, focused
  window. Supported prior formats are restored only if no newer clipboard owner
  took over. INCR transfers, rich-text input, clipboard managers, and deferred
  format negotiation remain unsupported.
- **Other native routes:** do not assume paste support.

A paste failure or incomplete receipt can follow actual input. Inspect the text
before retrying; a newer external clipboard copy may be what the app consumed.
Never automatically replay uncertain paste or substitute typing without accounting
for its different events and newline behavior. Verify saving separately when the
task requires a saved document.
