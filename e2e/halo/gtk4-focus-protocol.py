"""One exact owned GTK4 Component.GrabFocus reply; independent protocol evidence."""
import gi, os, json, time, pathlib, subprocess, hashlib
from gi.repository import Gio, GLib
point_only = os.environ.get("HALO_POINT_OWNERSHIP_PROBE") == "1"
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
    evidence["nodes"] = []
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
        evidence["nodes"].append({"busName": destination, "path": path, "name": name, "protocolRoleName": role})
        if name == "Receipt input":
            interfaces, = invoke(bus, destination, path, "org.a11y.atspi.Accessible", "GetInterfaces")
            # GTK GetRoleName uses GTK role vocabulary (e.g. textbox), unlike
            # libatspi's numeric-role display name. Prove the actual capability.
            assert "org.a11y.atspi.Component" in interfaces
            assert "org.a11y.atspi.EditableText" in interfaces
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
    if point_only:
        frame_refs, = invoke(bus, matches[0][0], matches[0][1], "org.a11y.atspi.Accessible", "GetChildren")
        assert len(frame_refs) == 1 and frame_refs[0][0] == destination, "One exact owned top-level required"
        frame = tuple(frame_refs[0])
        component = "org.a11y.atspi.Component"
        screen, = invoke(bus, destination, path, component, "GetExtents", GLib.Variant("(u)", (0,)))
        local, = invoke(bus, destination, path, component, "GetExtents", GLib.Variant("(u)", (1,)))
        assert local[2] > 0 and local[3] > 0
        x, y = local[0] + local[2] // 2, local[1] + local[3] // 2
        contains, = invoke(bus, destination, path, component, "Contains", GLib.Variant("(iiu)", (x, y, 1)))
        evidence["point"] = {"entryScreenExtents": screen, "entryWindowExtents": local,
            "windowPoint": [x, y], "entryContains": contains, "hitChain": [],
            "exactTargetOnChain": False, "readOnlyPointRequests": 0}
        current = frame
        seen = set()
        for _ in range(16):
            if current in seen:
                break
            assert current[0] == destination, "Cross-application hit query refused"
            seen.add(current)
            evidence["point"]["hitChain"].append({"busName": current[0], "path": current[1]})
            if current == (destination, path):
                evidence["point"]["exactTargetOnChain"] = True
            evidence["point"]["readOnlyPointRequests"] += 1
            try:
                next_ref, = invoke(bus, current[0], current[1], component, "GetAccessibleAtPoint",
                                   GLib.Variant("(iiu)", (x, y, 1)))
            except GLib.Error as error:
                evidence["point"]["queryError"] = {"remoteError": Gio.DBusError.get_remote_error(error), "message": str(error)}
                break
            next_ref = tuple(next_ref)
            if next_ref[1] == "/org/a11y/atspi/null" or next_ref == current:
                evidence["point"]["stop"] = "null" if next_ref[1].endswith("/null") else "same_object"
                break
            current = next_ref
        evidence["xwininfo"] = subprocess.check_output(["xwininfo", "-id", str(window)], text=True, timeout=5)
    else:
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
    if point_only:
        assert evidence["methodRequests"] == 0 and evidence["point"]["readOnlyPointRequests"] > 0
    else:
        assert evidence.get("remoteError") == "org.freedesktop.DBus.Error.NotSupported", evidence
    evidence["packages"] = subprocess.check_output(["dpkg-query", "-W", "libgtk-4-1", "libgtk-4-common", "gir1.2-gtk-4.0", "libatspi2.0-0"], text=True, timeout=5)
    library = pathlib.Path("/usr/lib/x86_64-linux-gnu/libgtk-4.so.1").resolve(strict=True)
    evidence["GTKLibrary"] = {"path": str(library), "sha256": hashlib.sha256(library.read_bytes()).hexdigest()}
    evidence["accepted"] = True
except Exception as error:
    evidence["failure"] = repr(error)
finally:
    (out / ("point-protocol.json" if point_only else "focus-protocol.json")).write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps({key: evidence.get(key) for key in ("accepted", "diagnosticOnly", "SDKFocusAcceptance", "methodRequests", "remoteError", "elapsedMs", "failure")}))
raise SystemExit(0 if evidence["accepted"] else 1)
