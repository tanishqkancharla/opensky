#!/usr/bin/python3
"""Real GTK scroll surfaces for the native foreground-delivery acceptance."""
import sys

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, GLib


def text_view(prefix):
    view = Gtk.TextView()
    view.set_editable(False)
    view.get_buffer().set_text("\n".join(f"{prefix} row {number}" for number in range(160)))
    return view


def scroller(prefix, status):
    scroll = Gtk.ScrolledWindow()
    scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.ALWAYS)
    scroll.add(text_view(prefix))
    adjustment = scroll.get_vadjustment()
    adjustment.connect("value-changed", lambda source: status.set_text(f"{prefix} offset: {round(source.get_value())}"))
    return scroll


def target():
    GLib.set_prgname("opensky-scroll-target")
    GLib.set_application_name("OpenSky Scroll Target")
    window = Gtk.Window(title="OpenSky Scroll Target")
    window.set_default_size(820, 600)
    window.move(40, 40)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
    box.set_border_width(16)
    window.add(box)
    target_status = Gtk.Label(label="Target offset: 0")
    nearby_status = Gtk.Label(label="Nearby offset: 0")
    panes = Gtk.Box(spacing=16)
    target_scroll = scroller("Target", target_status)
    nearby_scroll = scroller("Nearby", nearby_status)
    panes.pack_start(target_scroll, True, True, 0)
    panes.pack_start(nearby_scroll, True, True, 0)
    box.pack_start(target_status, False, False, 0)
    box.pack_start(nearby_status, False, False, 0)
    box.pack_start(panes, True, True, 0)
    window.connect("destroy", Gtk.main_quit)
    window.show_all()
    Gtk.main()


def sibling():
    GLib.set_prgname("opensky-scroll-sibling")
    GLib.set_application_name("OpenSky Scroll Sibling")
    window = Gtk.Window(title="OpenSky Scroll Sibling")
    window.set_default_size(340, 180)
    window.move(880, 40)
    window.add(Gtk.Label(label="Sibling offset: 0"))
    window.connect("destroy", Gtk.main_quit)
    window.show_all()
    Gtk.main()


if sys.argv[1:] == ["--target"]:
    target()
elif sys.argv[1:] == ["--sibling"]:
    sibling()
else:
    raise SystemExit("expected --target or --sibling")
