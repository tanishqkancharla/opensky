"""Read existing XComposite backing for the owned fixture and ancestors.

No redirection, stacking, input or repaint. Named temporary pixmaps are freed.
This is an application-fixture diagnostic, never a product capture fallback.
"""
import ctypes as C
import ctypes.util
import json
import sys
X = C.CDLL(ctypes.util.find_library("X11"))
comp = C.CDLL(ctypes.util.find_library("Xcomposite"))
D, W, I, U = C.c_void_p, C.c_ulong, C.c_int, C.c_uint
class XError(C.Structure):
    _fields_ = [("type", I), ("display", D), ("resourceid", W), ("serial", W),
                ("error_code", C.c_ubyte), ("request_code", C.c_ubyte), ("minor_code", C.c_ubyte)]
class Visual(C.Structure):
    _fields_ = [("ext_data", D), ("visualid", W), ("class_", I),
                ("red_mask", W), ("green_mask", W), ("blue_mask", W),
                ("bits_per_rgb", I), ("map_entries", I)]
class Attributes(C.Structure):
    _fields_ = [("x", I), ("y", I), ("width", I), ("height", I),
                ("border_width", I), ("depth", I), ("visual", C.POINTER(Visual)),
                ("root", W), ("class_", I), ("bit_gravity", I), ("win_gravity", I),
                ("backing_store", I), ("backing_planes", W), ("backing_pixel", W),
                ("save_under", I), ("colormap", W), ("map_installed", I), ("map_state", I),
                ("all_event_masks", C.c_long), ("your_event_mask", C.c_long),
                ("do_not_propagate_mask", C.c_long), ("override_redirect", I), ("screen", D)]
handler_type = C.CFUNCTYPE(I, D, C.POINTER(XError))
errors = []
@handler_type
def handle(display, error):
    errors.append({"code": error.contents.error_code, "request": error.contents.request_code,
                   "minor": error.contents.minor_code})
    return 0
X.XOpenDisplay.argtypes = [C.c_char_p]; X.XOpenDisplay.restype = D
X.XCloseDisplay.argtypes = [D]
X.XSync.argtypes = [D, I]
X.XGrabServer.argtypes = [D]; X.XUngrabServer.argtypes = [D]
X.XSetErrorHandler.argtypes = [D]; X.XSetErrorHandler.restype = D
X.XInternAtom.argtypes = [D, C.c_char_p, I]; X.XInternAtom.restype = W
X.XGetSelectionOwner.argtypes = [D, W]; X.XGetSelectionOwner.restype = W
X.XGetGeometry.argtypes = [D, W, C.POINTER(W), C.POINTER(I), C.POINTER(I),
                          C.POINTER(U), C.POINTER(U), C.POINTER(U), C.POINTER(U)]
X.XQueryTree.argtypes = [D, W, C.POINTER(W), C.POINTER(W), C.POINTER(C.POINTER(W)), C.POINTER(U)]
X.XGetWindowAttributes.argtypes = [D, W, C.POINTER(Attributes)]
X.XFree.argtypes = [D]
X.XFreePixmap.argtypes = [D, W]
X.XTranslateCoordinates.argtypes = [D, W, W, I, I, C.POINTER(I), C.POINTER(I), C.POINTER(W)]
comp.XCompositeNameWindowPixmap.argtypes = [D, W]; comp.XCompositeNameWindowPixmap.restype = W
conn = X.XOpenDisplay(None)
if not conn: raise RuntimeError("Owned fixture X11 connection unavailable")
previous = X.XSetErrorHandler(C.cast(handle, D))
def geometry(window, drawable_is_window=True):
    root, x, y, width, height, border, depth = W(), I(), I(), U(), U(), U(), U()
    if not X.XGetGeometry(conn, window, C.byref(root), C.byref(x), C.byref(y),
                          C.byref(width), C.byref(height), C.byref(border), C.byref(depth)):
        raise RuntimeError("Fixture geometry unavailable")
    dx, dy, child = I(), I(), W()
    if drawable_is_window:
        X.XTranslateCoordinates(conn, window, root, 0, 0, C.byref(dx), C.byref(dy), C.byref(child))
    result = {"root": root.value, "width": width.value, "height": height.value,
              "border": border.value, "depth": depth.value, "rootX": dx.value, "rootY": dy.value}
    if drawable_is_window:
        attrs = Attributes()
        if not X.XGetWindowAttributes(conn, window, C.byref(attrs)):
            raise RuntimeError("Fixture visual unavailable")
        visual = attrs.visual.contents
        result["visual"] = visual.visualid
        result["encoding"] = {"class": visual.class_, "redMask": visual.red_mask,
                              "greenMask": visual.green_mask, "blueMask": visual.blue_mask,
                              "bitsPerRGB": visual.bits_per_rgb}
    return result
try:
    X.XGrabServer(conn)
    atom = X.XInternAtom(conn, b"_NET_WM_CM_S0", 0)
    evidence = {"compositorSelectionOwner": X.XGetSelectionOwner(conn, atom), "ancestors": []}
    current = int(sys.argv[1], 0)
    for _ in range(128):
        geom = geometry(current)
        if current == geom["root"]: break
        errors.clear()
        pixmap = comp.XCompositeNameWindowPixmap(conn, current); X.XSync(conn, 0)
        entry = {"window": current, "geometry": geom, "nameErrors": errors[:], "backed": not errors}
        if not errors:
            entry["pixmapGeometry"] = geometry(pixmap, False)
            X.XFreePixmap(conn, pixmap); X.XSync(conn, 0)
        evidence["ancestors"].append(entry)
        root, parent, children, count = W(), W(), C.POINTER(W)(), U()
        if not X.XQueryTree(conn, current, C.byref(root), C.byref(parent), C.byref(children), C.byref(count)):
            raise RuntimeError("Fixture ancestry unavailable")
        if children: X.XFree(children)
        if parent.value in (0, current): raise RuntimeError("Unproven fixture ancestry")
        current = parent.value
    print(json.dumps(evidence))
finally:
    X.XUngrabServer(conn); X.XSync(conn, 0)
    X.XSetErrorHandler(previous); X.XCloseDisplay(conn)
