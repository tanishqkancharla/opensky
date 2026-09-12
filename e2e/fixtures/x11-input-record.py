"""Passive server-delivery trace for an owned disposable X11 test desktop.

Uses the RECORD interface documented by python-xlib's record_demo.py. No input
injection, window activation, clipboard access, or changes to event selection.
Device key events and client-delivered focus events do not prove application
processing. XI2 clients need not receive corresponding core keyboard events.
"""
import json
import sys
import threading
import time

from Xlib import X, display
from Xlib.ext import record
from Xlib.protocol import rq

control = display.Display()
data = display.Display()
if not data.has_extension("RECORD"):
    raise RuntimeError("The test display has no X11 RECORD extension")

context = control.record_create_context(0, [record.AllClients], [{
    "core_requests": (0, 0), "core_replies": (0, 0),
    "ext_requests": (0, 0, 0, 0), "ext_replies": (0, 0, 0, 0),
    "delivered_events": (X.FocusIn, X.FocusOut), "device_events": (X.KeyPress, X.KeyRelease),
    "errors": (0, 0), "client_started": False, "client_died": False,
}])
control.sync()


def emit(value):
    print(json.dumps({"receivedUnixNs": time.time_ns(), **value}), flush=True)


def receive(reply):
    if reply.category == record.StartOfData:
        emit({"kind": "ready"})
        return
    if reply.category != record.FromServer:
        return
    if reply.client_swapped:
        raise RuntimeError("Cannot decode opposite-endian X11 event data")
    pending = reply.data
    while pending:
        event, pending = rq.EventField(None).parse_binary_value(pending, data.display, None, None)
        if event.type not in (X.KeyPress, X.KeyRelease, X.FocusIn, X.FocusOut):
            continue
        value = {"kind": "event", "clientIdBase": reply.id_base, "type": event.type,
                 "scope": "device" if event.type in (X.KeyPress, X.KeyRelease) else "client"}
        for name in ("detail", "time", "state", "mode", "sequence_number", "send_event", "window", "event", "root", "child"):
            if hasattr(event, name):
                field = getattr(event, name)
                value[name] = getattr(field, "id", field)
        emit(value)


def stop_on_eof():
    sys.stdin.buffer.read()
    control.record_disable_context(context)
    control.flush()


threading.Thread(target=stop_on_eof, daemon=True).start()
try:
    data.record_enable_context(context, receive)
    emit({"kind": "stopped"})
finally:
    control.record_free_context(context)
    control.sync()
    data.close()
    control.close()
