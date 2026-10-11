import gi, json, os, pathlib
from gi.repository import Gtk, Gdk, GLib
out = pathlib.Path(os.environ["HALO_ARTIFACTS"])
win = Gtk.Window(title="Halo Contract Editor")
win.set_wmclass("halo-contract-editor", "HaloContractEditor")
win.set_default_size(640, 480)
view = Gtk.TextView(); buffer = view.get_buffer(); buffer.set_text("replace me")
win.add(view)
def snapshot():
    start, end = buffer.get_bounds()
    selection = buffer.get_selection_bounds()
    selected = buffer.get_text(*selection, True) if selection else ""
    payload = {"text": buffer.get_text(start, end, True), "selected": selected,
               "clipboard": Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).wait_for_text(),
               "focused": win.is_active(), "pid": os.getpid()}
    temporary = out / "editor-state.tmp"; temporary.write_text(json.dumps(payload, ensure_ascii=False))
    temporary.replace(out / "editor-state.json")
    return True
def key(widget, event):
    if event.state & Gdk.ModifierType.CONTROL_MASK and event.keyval in [Gdk.KEY_s, Gdk.KEY_S]:
        start, end = buffer.get_bounds()
        (out / "saved.txt").write_text(buffer.get_text(start, end, True), encoding="utf-8")
        snapshot(); return True
    return False
win.connect("key-press-event", key); win.connect("destroy", Gtk.main_quit)
win.show_all(); view.grab_focus(); GLib.timeout_add(50, snapshot); snapshot(); Gtk.main()
