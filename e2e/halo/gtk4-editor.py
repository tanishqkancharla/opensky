import gi, os, json, pathlib
gi.require_version("Gtk", "4.0")
from gi.repository import Gtk, GLib
out = pathlib.Path(os.environ["HALO_ARTIFACTS"])
counts = {"One": 0, "Dot": 0, "Two": 0}
events = []
sequence = 0
class Fixture(Gtk.Application):
    def do_activate(self):
        self.win = Gtk.ApplicationWindow(application=self, title="OpenSky GTK4 Ownership")
        self.win.set_titlebar(Gtk.HeaderBar())
        self.win.set_default_size(400, 300)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        box.set_margin_start(20); box.set_margin_end(20)
        box.set_margin_top(12); box.set_margin_bottom(12)
        grid = Gtk.Grid(column_spacing=2, row_spacing=2)
        for i, name in enumerate(["Dot", "One", "Two"]):
            button = Gtk.Button(label=name)
            button.set_size_request(90, 55)
            button.connect("clicked", self.clicked, name)
            grid.attach(button, i, 0, 1, 1)
        box.append(grid)
        self.result = Gtk.Label(label=self.label())
        box.append(self.result); self.win.set_child(box)
        self.win.present(); GLib.timeout_add(50, self.snapshot)
    def label(self):
        return " ".join(f"{name}:{count}" for name, count in counts.items())
    def clicked(self, button, name):
        counts[name] += 1; events.append(name)
        self.result.set_label(self.label()); self.snapshot()
    def snapshot(self):
        global sequence
        sequence += 1
        value = {"pid": os.getpid(), "counts": counts, "events": events,
                 "sampleSequence": sequence, "gtkVersion": [Gtk.get_major_version(), Gtk.get_minor_version(), Gtk.get_micro_version()],
                 "active": self.win.is_active(), "label": self.label()}
        tmp = out / "state.tmp"; tmp.write_text(json.dumps(value)); tmp.replace(out / "state.json")
        return True
Fixture(application_id="io.opensky.Gtk4Ownership").run(None)
