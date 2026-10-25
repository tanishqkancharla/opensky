"""One exact owned GTK4 Component.GrabFocus reply; independent protocol evidence."""
import gi, os, json, time, pathlib, subprocess, hashlib
from gi.repository import Gio, GLib
out = pathlib.Path(os.environ["HALO_ARTIFACTS"])
pid = int(os.environ["HALO_GTK4_PID"])
window = int(os.environ["HALO_GTK4_WINDOW"])
evidence = {"pid": pid, "windowId": window, "accepted": False,
            "diagnosticOnly": True, "SDKFocusAcceptance": False,
            "methodRequests": 0, "inputReplay": False}

def invoke(bus, destination, path, interface, method, args=None):
    return bus.call_sync(destination, path, interface, method, args, None,
                         Gio.DBusCallFlags.NONE, 2000, None).unpack()

def state():
    return json.loads((out / "state.json").read_text())

def fresh():
    previous = state()["sampleSequence"]
    for _ in range(100):
        value = state()
        if value["sampleSequence"] > previous:
            return value
        time.sleep(.02)
    raise AssertionError("Owned app stopped publishing state")

try:
    session = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    address, = invoke(session, "org.a11y.Bus", "/org/a11y/bus", "org.a11y.Bus", "GetAddress")
    bus = Gio.DBusConnection.new_for_address_sync(address,
        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
        None, None)
    children, = invoke(bus, "org.a11y.atspi.Registry", "/org/a11y/atspi/accessible/root",
                       "org.a11y.atspi.Accessible", "GetChildren")
    matches = []
    for destination, path in children:
        actual_pid, = invoke(bus, "org.freedesktop.DBus", "/org/freedesktop/DBus",
                             "org.freedesktop.DBus", "GetConnectionUnixProcessID",
                             GLib.Variant("(s)", (destination,)))
        if actual_pid == pid:
            matches.append((destination, path))
    assert len(matches) == 1, "One exact owned AT-SPI application required"
    queue = [matches[0]]
    visited = set()
    entries = []
    while queue:
        destination, path = queue.pop(0)
        assert destination == matches[0][0], "Cross-application object refused"
        if (destination, path) in visited:
            continue
        visited.add((destination, path))
        assert len(visited) <= 200, "Owned accessibility tree exceeded bound"
        name, = invoke(bus, destination, path, "org.freedesktop.DBus.Properties", "Get",
                       GLib.Variant("(ss)", ("org.a11y.atspi.Accessible", "Name")))
        if hasattr(name, "unpack"):
            name = name.unpack()
        role, = invoke(bus, destination, path, "org.a11y.atspi.Accessible", "GetRoleName")
        if name == "Receipt input" and role in ("text", "entry"):
            entries.append((destination, path))
        descendants, = invoke(bus, destination, path, "org.a11y.atspi.Accessible", "GetChildren")
        queue.extend((d, p) for d, p in descendants if p != "/org/a11y/atspi/null")
    assert len(entries) == 1, "One exact owned labelled entry required"
    destination, path = entries[0]
    evidence["target"] = {"busName": destination, "path": path, "pidVerifiedByBusDaemon": pid}
    before = fresh()
    assert before["pid"] == pid and before["active"]
    assert not before["entryFocused"] and before["inputText"] == ""
    assert before["entryActivations"] == before["popup"]["activations"] == 0
    assert not before["popup"]["mapped"]
    evidence["before"] = before
    started = time.monotonic()
    evidence["methodRequests"] += 1
    try:
        evidence["reply"] = invoke(bus, destination, path,
                                   "org.a11y.atspi.Component", "GrabFocus")
    except GLib.Error as error:
        evidence["remoteError"] = Gio.DBusError.get_remote_error(error)
        evidence["errorMessage"] = str(error)
    evidence["elapsedMs"] = (time.monotonic() - started) * 1000
    samples = [fresh() for _ in range(5)]
    evidence["afterSamples"] = samples
    for after in samples:
        for key in ("pid", "active", "entryFocused", "inputText", "entryActivations", "popup", "counts", "events"):
            assert after[key] == before[key], "Unexpected owned app change: " + key
    assert evidence.get("remoteError") == "org.freedesktop.DBus.Error.NotSupported", evidence
    evidence["packages"] = subprocess.check_output(["dpkg-query", "-W", "libgtk-4-1", "libgtk-4-common", "gir1.2-gtk-4.0", "libatspi2.0-0"], text=True, timeout=5)
    library = pathlib.Path("/usr/lib/x86_64-linux-gnu/libgtk-4.so.1").resolve(strict=True)
    evidence["GTKLibrary"] = {"path": str(library), "sha256": hashlib.sha256(library.read_bytes()).hexdigest()}
    evidence["accepted"] = True
except Exception as error:
    evidence["failure"] = repr(error)
finally:
    (out / "focus-protocol.json").write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps({key: evidence.get(key) for key in ("accepted", "diagnosticOnly", "SDKFocusAcceptance", "methodRequests", "remoteError", "elapsedMs", "failure")}))
raise SystemExit(0 if evidence["accepted"] else 1)
