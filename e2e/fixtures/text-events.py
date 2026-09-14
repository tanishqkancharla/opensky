#!/usr/bin/env python3
"""Passive, process-scoped AT-SPI text-event recorder for one owned app."""
import json
import sys
import time

import gi

gi.require_version("Atspi", "2.0")
gi.require_version("GLib", "2.0")
from gi.repository import Atspi, GLib


if len(sys.argv) != 2:
    raise SystemExit("usage: text-events.py <owned-application-pid>")

OWNED_PID = int(sys.argv[1])
if OWNED_PID <= 0:
    raise SystemExit("owned pid must be positive")

LOOP = GLib.MainLoop()
STOPPED = False
# AT-SPI's GI binding does not expose Accessible.get_path().  Keep the actual
# wrappers alive and give each observed wrapper a recorder-local ID instead.
SOURCES = []


def now_ms():
    return round(time.time() * 1000)


def emit(value):
    print(json.dumps(value, ensure_ascii=False, sort_keys=True), flush=True)


def error_value(callback):
    try:
        return callback()
    except Exception as error:
        return {"error": str(error), "type": type(error).__name__}


def event_error(error, phase):
    # A diagnostic failure must survive in the same retained JSONL trace.
    emit({"kind": "callback-error", "timestampMs": now_ms(), "phase": phase,
          "error": str(error), "errorType": type(error).__name__})


def event_payload(value):
    """Retain only event-provided payload; never synchronously read document text."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    try:
        return str(value)
    except Exception as error:
        return {"error": str(error), "type": type(error).__name__}


def source_id(source):
    for retained, opaque_id in SOURCES:
        if retained is source:
            return opaque_id
    opaque_id = f"source-{len(SOURCES) + 1}"
    SOURCES.append((source, opaque_id))
    return opaque_id


def owned_application(source):
    """Check exact PID before reading any optional source/app metadata."""
    application = source.get_application()
    if application.get_process_id() != OWNED_PID:
        return None
    return application


def source_identity(source, application):
    # Application name, source name, and role can disappear while an event is
    # in flight. Preserve those access errors as evidence rather than failing
    # the callback or inventing an identity from display metadata.
    return {
        "id": source_id(source),
        "applicationPid": OWNED_PID,
        "applicationName": error_value(application.get_name),
        "name": error_value(source.get_name),
        "role": error_value(source.get_role_name),
    }


def event_received(event, _user_data):
    try:
        application = owned_application(event.source)
        if application is None:
            return
        emit({
            "kind": "event",
            "timestampMs": now_ms(),
            "type": event.type,
            "source": source_identity(event.source, application),
            "offset": event.detail1,
            "length": event.detail2,
            "payload": event_payload(event.any_data),
        })
    except Exception as error:
        event_error(error, "event_received")


def stop(_channel, _condition):
    global STOPPED
    if not STOPPED:
        STOPPED = True
        emit({"kind": "stopped", "timestampMs": now_ms()})
        LOOP.quit()
    return False


listener = Atspi.EventListener.new(event_received, None)
EVENT_TYPES = [
    "object:text-changed",
    "object:text-selection-changed",
    "object:state-changed:focused",
]
registered = []
exit_error = None
try:
    for event_type in EVENT_TYPES:
        if not listener.register(event_type):
            raise RuntimeError(f"AT-SPI refused event subscription: {event_type}")
        registered.append(event_type)
    GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, stop)
    emit({"kind": "ready", "pid": OWNED_PID, "registered": registered,
          "timestampMs": now_ms()})
    LOOP.run()
except Exception as error:
    exit_error = error
    event_error(error, "observer")
finally:
    for event_type in registered:
        try:
            listener.deregister(event_type)
        except Exception as error:
            event_error(error, f"deregister:{event_type}")
            if exit_error is None:
                exit_error = error
    if not STOPPED:
        emit({"kind": "stopped", "timestampMs": now_ms(), "reason": "exception"})

if exit_error is not None:
    raise SystemExit(str(exit_error))
