#!/usr/bin/python3
"""A visible GTK3 app that inserts an identical entry above a live entry."""
import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk

TARGET = "SELECTION_IDENTITY_DUPLICATE_v1"

class SelectionIdentityWindow(Gtk.Window):
    def __init__(self):
        super().__init__(title="OpenSky Selection Identity Lab")
        self.set_default_size(520, 260)
        self.set_border_width(18)
        self.box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        self.add(self.box)
        self.drift_applied = False
        self.entries = []
        self.original = Gtk.Entry()
        self.original.set_text(TARGET)
        self.original.get_accessible().set_name("Observed selection target")
        self.original.connect("notify::selection-bound", self.selection_changed, "original")
        self.original.connect("notify::cursor-position", self.selection_changed, "original")
        self.entries.append((self.original, "original"))
        self.box.pack_start(Gtk.Label(label="Observed entry", xalign=0), False, False, 0)
        self.box.pack_start(self.original, False, False, 0)
        self.reset = Gtk.Button(label="Reset selection")
        self.reset.connect("clicked", self.reset_selection)
        self.box.pack_start(self.reset, False, False, 0)
        self.insert = Gtk.Button(label="Insert duplicate above")
        self.insert.connect("clicked", self.insert_duplicate)
        self.box.pack_start(self.insert, False, False, 0)
        self.status = Gtk.Label(label="selection_drift=armed", xalign=0)
        self.box.pack_start(self.status, False, False, 0)
        self.connect("destroy", Gtk.main_quit)

    def insert_duplicate(self, _button):
        if self.drift_applied:
            self.reset_selection(self.insert)
            return
        duplicate = Gtk.Entry()
        duplicate.set_text(TARGET)
        duplicate.get_accessible().set_name("Inserted duplicate")
        duplicate.connect("notify::selection-bound", self.selection_changed, "inserted")
        duplicate.connect("notify::cursor-position", self.selection_changed, "inserted")
        self.entries.append((duplicate, "inserted"))
        self.box.pack_start(duplicate, False, False, 0)
        self.box.reorder_child(duplicate, 1)
        duplicate.show()
        self.drift_applied = True
        self.reset_selection(self.insert)

    def reset_selection(self, _button):
        for entry, _name in self.entries:
            entry.select_region(0, 0)
        self.reset.grab_focus()
        self.update_status()

    def selection_changed(self, entry, _property, name):
        self.update_status()

    def update_status(self):
        prefix = "selection_drift=applied" if self.drift_applied else "selection_drift=armed"
        for entry, name in self.entries:
            bounds = entry.get_selection_bounds()
            selected = bool(bounds[0]) if len(bounds) == 3 else len(bounds) == 2
            if selected:
                start, end = bounds[-2:]
                self.status.set_text(f"{prefix} selection_target={name} selection_range={start}:{end}")
                return
        self.status.set_text(f"{prefix} selection_target=none selection_range=none")

window = SelectionIdentityWindow()
window.show_all()
window.reset_selection(window.reset)
Gtk.main()
