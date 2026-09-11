#!/usr/bin/env python3
"""Independent X11 clipboard owner/requestor for Linux SDK acceptance tests.

It uses the desktop's real CLIPBOARD selection.  It is deliberately outside the
OpenSky runtime: the test fixture starts an owner, public SDK paste acts, and a
separate requestor reads the resulting selection after the action returns.
"""
import argparse, ctypes as C, json, os, signal, sys, time

X = C.CDLL("libX11.so.6")
Atom = C.c_ulong
Window = C.c_ulong
NoneAtom = 0
SelectionRequest = 30
SelectionNotify = 31
PropModeReplace = 0

class SelectionRequestEvent(C.Structure):
    _fields_ = [("type", C.c_int), ("serial", C.c_ulong), ("send_event", C.c_int), ("display", C.c_void_p),
                ("owner", Window), ("requestor", Window), ("selection", Atom), ("target", Atom), ("property", Atom), ("time", C.c_ulong)]
class SelectionEvent(C.Structure):
    _fields_ = [("type", C.c_int), ("serial", C.c_ulong), ("send_event", C.c_int), ("display", C.c_void_p),
                ("requestor", Window), ("selection", Atom), ("target", Atom), ("property", Atom), ("time", C.c_ulong)]
class XEvent(C.Union):
    _fields_ = [("type", C.c_int), ("request", SelectionRequestEvent), ("selection", SelectionEvent), ("pad", C.c_long * 24)]

X.XOpenDisplay.argtypes = [C.c_char_p]; X.XOpenDisplay.restype = C.c_void_p
X.XCloseDisplay.argtypes = [C.c_void_p]
X.XDefaultRootWindow.argtypes = [C.c_void_p]; X.XDefaultRootWindow.restype = Window
X.XCreateSimpleWindow.argtypes = [C.c_void_p, Window, C.c_int, C.c_int, C.c_uint, C.c_uint, C.c_uint, C.c_ulong, C.c_ulong]; X.XCreateSimpleWindow.restype = Window
X.XDestroyWindow.argtypes = [C.c_void_p, Window]
X.XInternAtom.argtypes = [C.c_void_p, C.c_char_p, C.c_int]; X.XInternAtom.restype = Atom
X.XGetAtomName.argtypes = [C.c_void_p, Atom]; X.XGetAtomName.restype = C.c_char_p
X.XSetSelectionOwner.argtypes = [C.c_void_p, Atom, Window, C.c_ulong]
X.XGetSelectionOwner.argtypes = [C.c_void_p, Atom]; X.XGetSelectionOwner.restype = Window
X.XChangeProperty.argtypes = [C.c_void_p, Window, Atom, Atom, C.c_int, C.c_int, C.c_void_p, C.c_int]
X.XDeleteProperty.argtypes = [C.c_void_p, Window, Atom]
X.XConvertSelection.argtypes = [C.c_void_p, Atom, Atom, Atom, Window, C.c_ulong]
X.XGetWindowProperty.argtypes = [C.c_void_p, Window, Atom, C.c_long, C.c_long, C.c_int, Atom, C.POINTER(Atom), C.POINTER(C.c_int), C.POINTER(C.c_ulong), C.POINTER(C.c_ulong), C.POINTER(C.c_void_p)]
X.XGetWindowProperty.restype = C.c_int
X.XFree.argtypes = [C.c_void_p]
X.XPending.argtypes = [C.c_void_p]; X.XPending.restype = C.c_int
X.XNextEvent.argtypes = [C.c_void_p, C.POINTER(XEvent)]
X.XSendEvent.argtypes = [C.c_void_p, Window, C.c_int, C.c_long, C.POINTER(XEvent)]; X.XSendEvent.restype = C.c_int
X.XFlush.argtypes = [C.c_void_p]

FORMATS = [
    ("UTF8_STRING", "UTF8_STRING", 8, bytes("Original clipboard Ω", "utf8")),
    ("text/html", "text/html", 8, b"<b>Original clipboard</b>"),
    ("application/x-opensky-test-binary", "application/x-opensky-test-binary", 8, bytes([0,255,17,0,128])),
    ("application/x-opensky-test-u16", "INTEGER", 16, bytes([0,0,255,255,52,18])),
    ("application/x-opensky-test-u32", "CARDINAL", 32, bytes([0,0,0,0,255,255,255,255,120,86,52,18])),
]

def display():
    d = X.XOpenDisplay(None)
    if not d: raise RuntimeError("No X11 display for external clipboard client")
    return d
def atom(d, name): return int(X.XInternAtom(d, name.encode(), False))
def atom_name(d, value):
    raw = X.XGetAtomName(d, value)
    return raw.decode() if raw else None
def window(d): return int(X.XCreateSimpleWindow(d, X.XDefaultRootWindow(d), 0, 0, 1, 1, 0, 0, 0))
def property_value(d, w, prop):
    actual_type, fmt, count, after, value = Atom(), C.c_int(), C.c_ulong(), C.c_ulong(), C.c_void_p()
    status = X.XGetWindowProperty(d, w, prop, 0, 65536, True, 0, C.byref(actual_type), C.byref(fmt), C.byref(count), C.byref(after), C.byref(value))
    if status or after.value: raise RuntimeError("clipboard property was unavailable or truncated")
    if fmt.value == 8: raw = C.string_at(value, count.value)
    elif fmt.value == 16: raw = b"".join(int(n).to_bytes(2, sys.byteorder) for n in C.cast(value, C.POINTER(C.c_ushort))[:count.value])
    elif fmt.value == 32: raw = b"".join((int(n) & 0xffffffff).to_bytes(4, sys.byteorder) for n in C.cast(value, C.POINTER(C.c_ulong))[:count.value])
    else: raw = b""
    if value: X.XFree(value)
    return int(actual_type.value), fmt.value, raw
def request(d, w, clipboard, target):
    prop = atom(d, "_OPENSKY_SDK_CLIPBOARD_WITNESS")
    X.XDeleteProperty(d, w, prop); X.XConvertSelection(d, clipboard, target, prop, w, 0); X.XFlush(d)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if X.XPending(d):
            event = XEvent(); X.XNextEvent(d, C.byref(event))
            if event.type == SelectionNotify and event.selection.requestor == w and event.selection.target == target:
                if not event.selection.property: raise RuntimeError("external clipboard request was refused")
                return property_value(d, w, prop)
        else: time.sleep(.002)
    raise RuntimeError("external clipboard request timed out")
def owner(state, report):
    d = display(); w = window(d); clipboard = atom(d, "CLIPBOARD"); targets = atom(d, "TARGETS")
    values = [(atom(d,t), atom(d,ty), width, raw) for t,ty,width,raw in FORMATS]
    X.XSetSelectionOwner(d, clipboard, w, 0); X.XFlush(d)
    if X.XGetSelectionOwner(d, clipboard) != w: raise RuntimeError("external owner did not acquire CLIPBOARD")
    with open(state, "w") as f: json.dump({"owner": w, "formats": [{"target":t,"type":ty,"width":width,"bytesHex":raw.hex()} for t,ty,width,raw in FORMATS]}, f)
    stopped = [False]
    signal.signal(signal.SIGTERM, lambda *_: stopped.__setitem__(0, True))
    requests = []
    try:
        while not stopped[0]:
            if not X.XPending(d): time.sleep(.002); continue
            event = XEvent(); X.XNextEvent(d, C.byref(event))
            if event.type != SelectionRequest: continue
            r = event.request; prop = int(r.property or r.target)
            if r.selection != clipboard or r.owner != w: prop = 0
            elif r.target == targets:
                atoms = (Atom * (len(values)+1))(targets, *[target for target,_,_,_ in values])
                X.XChangeProperty(d, r.requestor, prop, 4, 32, PropModeReplace, C.cast(atoms, C.c_void_p), len(atoms))
            else:
                value = next((item for item in values if item[0] == r.target), None)
                if value is None: prop = 0
                else:
                    _, type_, width, raw = value
                    if width == 8: data = (C.c_ubyte * len(raw)).from_buffer_copy(raw); count = len(raw)
                    elif width == 16: data = (C.c_ushort * (len(raw)//2)).from_buffer_copy(raw); count = len(raw)//2
                    else: data = (C.c_ulong * (len(raw)//4))(*[int.from_bytes(raw[i:i+4], sys.byteorder) for i in range(0,len(raw),4)]); count = len(raw)//4
                    X.XChangeProperty(d, r.requestor, prop, type_, width, PropModeReplace, C.cast(data, C.c_void_p), count)
            reply = XEvent(); reply.selection = SelectionEvent(SelectionNotify, 0, 1, d, r.requestor, r.selection, r.target, prop, r.time)
            X.XSendEvent(d, r.requestor, False, 0, C.byref(reply)); X.XFlush(d)
            requests.append({"target": atom_name(d, r.target), "property": prop})
    finally:
        with open(report, "w") as f: json.dump({"requests": requests, "released": True}, f)
        X.XDestroyWindow(d, w); X.XCloseDisplay(d)
def read_all():
    d = display(); w = window(d); clipboard = atom(d, "CLIPBOARD")
    owner_id = int(X.XGetSelectionOwner(d, clipboard))
    if not owner_id: return {"owner": 0, "targets": [] , "formats": {}}
    target_type, target_width, target_raw = request(d, w, clipboard, atom(d, "TARGETS"))
    if target_width != 32: raise RuntimeError("TARGETS was not ATOM/32")
    targets = [atom_name(d, int.from_bytes(target_raw[i:i+4], sys.byteorder)) for i in range(0, len(target_raw), 4)]
    result = {}
    for target, _, _, _ in FORMATS:
        type_, width, raw = request(d, w, clipboard, atom(d, target))
        result[target] = {"type": atom_name(d, type_), "width": width, "bytesHex": raw.hex()}
    X.XDestroyWindow(d, w); X.XCloseDisplay(d)
    return {"owner": owner_id, "targets": targets, "formats": result}
def clear():
    d = display(); clipboard = atom(d, "CLIPBOARD"); X.XSetSelectionOwner(d, clipboard, 0, 0); X.XFlush(d)
    result = {"owner": int(X.XGetSelectionOwner(d, clipboard))}; X.XCloseDisplay(d); return result
parser = argparse.ArgumentParser(); group = parser.add_mutually_exclusive_group(required=True)
group.add_argument("--owner", nargs=2, metavar=("STATE","REPORT")); group.add_argument("--read", action="store_true"); group.add_argument("--clear", action="store_true")
args = parser.parse_args()
if args.owner: owner(*args.owner)
elif args.read: print(json.dumps(read_all()))
else: print(json.dumps(clear()))
