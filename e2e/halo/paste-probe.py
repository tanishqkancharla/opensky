"""Opt-in private GTK/AT-SPI clipboard experiment; not SDK acceptance."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

out = Path(os.environ["HALO_ARTIFACTS"])
pid = int(os.environ["HALO_EDITOR_PID"])
window = os.environ["HALO_EDITOR_WINDOW"]
route = os.environ.get("HALO_PASTE_PROBE_ROUTE", "atspi")
if route not in ("atspi", "foreground"):
    raise ValueError("Unknown private paste probe route")
clipboards = []
evidence = {"scope": "raw AT-SPI GTK paste feasibility; no OpenSky/native-agent run",
            "editorPid": pid, "window": window, "route": route, "uid": os.geteuid(),
            "display": os.environ.get("DISPLAY"), "sharedSessionBus": bool(os.environ.get("DBUS_SESSION_BUS_ADDRESS")),
            "effectiveCapabilities": next(line.split(":", 1)[1].strip() for line in Path("/proc/self/status").read_text().splitlines() if line.startswith("CapEff:")),
            "cases": [], "cleanup": []}

def wait_for(read, predicate, seconds=5):
    deadline = time.monotonic() + seconds
    while True:
        value = read()
        if predicate(value):
            return value
        if time.monotonic() >= deadline:
            raise RuntimeError("Bounded fixture observation did not reach expected state")
        time.sleep(.05)

def editor_state():
    try:
        return json.loads((out / "editor-state.json").read_text())
    except (FileNotFoundError, ValueError):
        return {}

def find_editor():
    desktop = Atspi.get_desktop(0)
    for n in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(n)
        if app.get_process_id() != pid:
            continue
        pending = [app]
        for _ in range(128):
            if not pending:
                break
            node = pending.pop(0)
            if node.get_state_set().contains(Atspi.StateType.FOCUSED):
                editable = node.get_editable_text_iface()
                text = node.get_text_iface()
                if editable is not None and text is not None:
                    return node, editable, text
            pending.extend(node.get_child_at_index(k) for k in range(node.get_child_count()))
    return None

def clipboard(text):
    process = subprocess.Popen(["xclip", "-selection", "clipboard", "-loops", "0", "-quiet"],
                               stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    clipboards.append(process)
    process.stdin.write(text.encode("utf-8")); process.stdin.close()
    wait_for(lambda: subprocess.check_output(["xclip", "-selection", "clipboard", "-out"], timeout=2).decode("utf-8"), lambda s: s == text)
    return process.pid

try:
    node, editable, text = wait_for(find_editor, lambda value: value is not None)
    for name, payload, selected, position in [
        ("ascii-insert", "ASCII paste\nsecond line", False, 5),
        ("unicode-selected-replacement", "Καλημέρα café 東京 🙂\nsecond line", True, 0),
    ]:
        if not editable.set_text_contents("replace me"):
            raise RuntimeError("Private fixture reset refused")
        wait_for(editor_state, lambda s: s.get("text") == "replace me")
        if selected:
            if not text.add_selection(0, 10):
                raise RuntimeError("Private selection setup refused")
        elif not text.set_caret_offset(position):
            raise RuntimeError("Private caret setup refused")
        before = wait_for(editor_state, lambda s: s.get("selected") == ("replace me" if selected else ""))
        owner = clipboard(payload)
        if route == "atspi":
            accepted = editable.paste_text(position)
        else:
            active = int(subprocess.check_output(["xdotool", "getactivewindow"], timeout=3).strip())
            if active != int(window, 0) or not before.get("focused"):
                raise RuntimeError("Exact private editor is not foreground; no paste chord sent")
            subprocess.run(["xdotool", "key", "--clearmodifiers", "ctrl+v"], check=True, timeout=5)
            accepted = "XTEST chord dispatched; actual buffer/saved bytes decide delivery"
        expected = payload if selected else "repla" + payload + "ce me"
        # A D-Bus reply may precede GTK's asynchronous clipboard callback.
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            after = editor_state()
            if after.get("text") == expected:
                break
            time.sleep(.05)
        subprocess.run(["xdotool", "windowactivate", "--sync", window], check=True, timeout=5)
        subprocess.run(["xdotool", "key", "--clearmodifiers", "ctrl+s"], check=True, timeout=5)
        saved = wait_for(lambda: (out / "saved.txt").read_text() if (out / "saved.txt").exists() else None,
                         lambda value: value == editor_state().get("text"))
        after = editor_state()
        item = {"name": name, "payload": payload, "before": before, "pasteReply": accepted,
                "expected": expected, "after": after, "matchesExpected": after.get("text") == expected,
                "saved": saved, "savedEqualsBuffer": saved == after.get("text"),
                "savedSHA256": hashlib.sha256(saved.encode("utf-8")).hexdigest(),
                "clipboardPayloadRetained": after.get("clipboard") == payload, "clipboardOwnerPid": owner}
        evidence["cases"].append(item)
        (out / (name + "-saved.txt")).write_text(saved)
    evidence["rawInsertSupported"] = evidence["cases"][0]["matchesExpected"]
    evidence["rawSelectedReplacementSupported"] = evidence["cases"][1]["matchesExpected"]
finally:
    for process in clipboards:
        if process.poll() is None:
            process.terminate()
        try:
            code = process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill(); code = process.wait(timeout=3)
        evidence["cleanup"].append({"ownedPid": process.pid, "exited": process.poll() is not None, "returnCode": code})
    (out / "paste-probe.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
