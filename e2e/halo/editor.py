import gi, json, os, pathlib
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk, GLib, GObject
out = pathlib.Path(os.environ["HALO_ARTIFACTS"])
win = Gtk.Window(title="Halo Contract Editor")
win.set_wmclass("halo-contract-editor", "HaloContractEditor")
win.set_default_size(640, 480)
view = Gtk.TextView(); buffer = view.get_buffer(); buffer.set_text("replace me")
win.add(view)
theme = "light"
sample_sequence = 0
def snapshot():
    global theme, sample_sequence
    sample_sequence += 1
    if theme != "dark" and (out / "request-dark-theme").exists():
        css = Gtk.CssProvider(); css.load_from_data(b"textview, textview text {background-color:#000; color:#fff;}")
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        theme = "dark"
    start, end = buffer.get_bounds()
    selection = buffer.get_selection_bounds()
    selected = buffer.get_text(*selection, True) if selection else ""
    payload = {"text": buffer.get_text(start, end, True), "selected": selected,
               "clipboard": Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).wait_for_text(),
               "focused": win.is_active(), "pid": os.getpid(), "theme": theme, "sampleSequence": sample_sequence}
    temporary = out / "editor-state.tmp"; temporary.write_text(json.dumps(payload, ensure_ascii=False))
    temporary.replace(out / "editor-state.json")
    return True
def key(widget, event):
    if event.state & Gdk.ModifierType.CONTROL_MASK and event.keyval in [Gdk.KEY_s, Gdk.KEY_S]:
        start, end = buffer.get_bounds()
        (out / "saved.txt").write_text(buffer.get_text(start, end, True), encoding="utf-8")
        snapshot(); return True
    return False
# Private fixture emulates an app that accepts only a prefix of clipboard text.
# No test switch is present in the shipped driver or SDK.
def paste(widget):
    if (out / "request-partial-paste").exists():
        payload = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).wait_for_text()
        GObject.signal_stop_emission_by_name(widget, "paste-clipboard")
        if payload is not None:
            buffer.delete_selection(True, True)
            buffer.insert_at_cursor(payload[:3])
        snapshot()
view.connect("paste-clipboard", paste)
win.connect("key-press-event", key); win.connect("destroy", Gtk.main_quit)
win.show_all(); view.grab_focus(); GLib.timeout_add(50, snapshot); snapshot(); Gtk.main()
