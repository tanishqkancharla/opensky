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

def record_range(**selected):
    """Build one RECORD range; separate ranges form a union, not an intersection."""
    value = {
        "core_requests": (0, 0), "core_replies": (0, 0),
        "ext_requests": (0, 0, 0, 0), "ext_replies": (0, 0, 0, 0),
        "delivered_events": (0, 0), "device_events": (0, 0),
        "errors": (0, 0), "client_started": False, "client_died": False,
    }
    value.update(selected)
    return value


context = control.record_create_context(0, [record.AllClients], [
    record_range(
        delivered_events=(X.FocusIn, X.FocusOut),
        device_events=(X.KeyPress, X.KeyRelease),
    ),
    # X11 core protocol opcode 100. This is only observed; this process never
    # changes a map, input state, focus, or event selection.
    record_range(core_requests=(100, 100)),
    record_range(delivered_events=(X.MappingNotify, X.MappingNotify)),
])
control.sync()


def emit(value):
    print(json.dumps({"receivedUnixNs": time.time_ns(), **value}), flush=True)


def reply_metadata(reply, source):
    return {
        "clientIdBase": reply.id_base,
        "source": source,
        "serverTime": reply.server_time,
        "recordedSequenceNumber": reply.recorded_sequence_number,
    }


def decode_change_keyboard_mapping(pending, reply):
    """Decode the raw X11 ChangeKeyboardMapping request stream from RECORD.

    Request bytes use the observed client's byte order. Opposite-endian data is
    rejected by receive(), so native byte order is the server/client byte order.
    """
    byteorder = sys.byteorder
    while pending:
        if len(pending) < 8:
            emit({
                "kind": "requestDecodeError", **reply_metadata(reply, "client"),
                "request": "ChangeKeyboardMapping", "reason": "short-header",
                "byteLength": len(pending),
            })
            return
        opcode = pending[0]
        keycode_count = pending[1]
        request_length = int.from_bytes(pending[2:4], byteorder)
        byte_length = request_length * 4
        if opcode != 100 or request_length < 2 or byte_length > len(pending):
            emit({
                "kind": "requestDecodeError", **reply_metadata(reply, "client"),
                "request": "ChangeKeyboardMapping", "opcode": opcode,
                "reason": "invalid-length", "requestLength": request_length,
                "availableBytes": len(pending),
            })
            return

        request, pending = pending[:byte_length], pending[byte_length:]
        first_keycode = request[4]
        keysyms_per_keycode = request[5]
        keysyms = [
            int.from_bytes(request[offset:offset + 4], byteorder)
            for offset in range(8, len(request), 4)
        ]
        if (keycode_count == 0 or keysyms_per_keycode == 0
                or len(keysyms) != keycode_count * keysyms_per_keycode):
            emit({
                "kind": "requestDecodeError", **reply_metadata(reply, "client"),
                "request": "ChangeKeyboardMapping", "reason": "invalid-keysyms",
                "firstKeycode": first_keycode, "keycodeCount": keycode_count,
                "keysymsPerKeycode": keysyms_per_keycode,
                "keysymsLength": len(keysyms),
            })
            continue
        emit({
            "kind": "request", **reply_metadata(reply, "client"),
            "request": "ChangeKeyboardMapping", "opcode": opcode,
            "firstKeycode": first_keycode, "keycodeCount": keycode_count,
            "keysymsPerKeycode": keysyms_per_keycode, "keysyms": keysyms,
        })


def receive(reply):
    if reply.category == record.StartOfData:
        emit({"kind": "ready"})
        return
    if reply.category not in (record.FromServer, record.FromClient):
        return
    if reply.client_swapped:
        raise RuntimeError("Cannot decode opposite-endian X11 RECORD data")
    if reply.category == record.FromClient:
        decode_change_keyboard_mapping(reply.data, reply)
        return
    pending = reply.data
    while pending:
        event, pending = rq.EventField(None).parse_binary_value(pending, data.display, None, None)
        if event.type not in (X.KeyPress, X.KeyRelease, X.FocusIn, X.FocusOut, X.MappingNotify):
            continue
        value = {**reply_metadata(reply, "server"), "type": event.type,
                 "scope": "device" if event.type in (X.KeyPress, X.KeyRelease) else "client"}
        if event.type == X.MappingNotify:
            value["kind"] = "mappingNotify"
            names = ("request", "first_keycode", "count", "sequence_number", "send_event")
        else:
            value["kind"] = "event"
            names = ("detail", "time", "state", "mode", "sequence_number", "send_event", "window", "event", "root", "child")
        for name in names:
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
