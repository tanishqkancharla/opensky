#!/usr/bin/python3
"""Read-only AT-SPI geometry probe for one explicitly owned Linux process.

Run in its existing desktop/D-Bus session. Prints JSON; never focuses or writes.
"""
import argparse
import json
import signal
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    args = parser.parse_args()
    if args.pid <= 0:
        parser.error("--pid must be positive")

    import gi
    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi

    def timed_out(_signal, _frame):
        raise TimeoutError("Read-only probe exceeded 60 seconds")

    signal.signal(signal.SIGALRM, timed_out)
    signal.alarm(60)

    def optional(callback):
        try:
            return callback()
        except TimeoutError:
            raise
        except Exception as error:
            return {"error": str(error)}

    def identity(node):
        # GI versions do not all expose Atspi.Object's public C fields. Do not
        # substitute a Python memory address for a D-Bus object identity.
        result = {}
        for key in ("path", "bus_name"):
            value = getattr(node, key, None)
            if isinstance(value, str):
                result[key] = value
        app = getattr(node, "app", None)
        bus = getattr(app, "bus_name", None) if app is not None else None
        if isinstance(bus, str):
            result["bus_name"] = bus
        return result or None

    def states(node):
        state = node.get_state_set()
        return {name.lower(): state.contains(getattr(Atspi.StateType, name))
                for name in ("SHOWING", "VISIBLE", "ENABLED", "SENSITIVE",
                             "FOCUSED", "EDITABLE", "DEFUNCT")}

    def bounds(node, coord):
        rect = node.get_component_iface().get_extents(coord)
        return {"x": rect.x, "y": rect.y,
                "width": rect.width, "height": rect.height}

    def describe(node, route):
        interfaces = list(node.get_interfaces())
        row = {"tree_path": route, "name": node.get_name(),
               "role": node.get_role_name(), "interfaces": interfaces,
               "states": states(node), "object_identity": optional(lambda: identity(node))}
        if "Component" in interfaces:
            row["screen"] = optional(lambda: bounds(node, Atspi.CoordType.SCREEN))
            row["window"] = optional(lambda: bounds(node, Atspi.CoordType.WINDOW))
        return row

    desktop = Atspi.get_desktop(0)
    count = desktop.get_child_count()
    if not 0 <= count <= 128:
        raise RuntimeError("Desktop application inventory exceeds bounds")
    apps = []
    for index in range(count):
        app = desktop.get_child_at_index(index)
        # Only application PID metadata is inspected outside the selected app.
        if app.get_process_id() == args.pid:
            apps.append(app)
    if len(apps) != 1:
        raise RuntimeError(f"Expected exactly one AT-SPI application for PID {args.pid}; found {len(apps)}")
    app = apps[0]
    stack = [(app, [], [])]
    matches = []
    visited = 0
    while stack:
        node, route, ancestors = stack.pop()
        visited += 1
        if visited > 12000 or len(route) > 48:
            raise RuntimeError("Application tree exceeds diagnostic node/depth bounds")
        state = states(node)
        interfaces = list(node.get_interfaces())
        role = node.get_role_name()
        if (state["showing"] and state["visible"] and not state["defunct"]
                and role.lower() in ("text", "entry", "spin button") and "Text" in interfaces):
            length = Atspi.Text.get_character_count(node)
            if 0 <= length <= 64:
                text = Atspi.Text.get_text(node, 0, length)
                if text.strip() in ("70 pt", "60 pt"):
                    matches.append((node, route, ancestors, text))
        children = node.get_child_count()
        if not 0 <= children <= 12000 or visited + len(stack) + children > 12000:
            raise RuntimeError("Application tree exceeds diagnostic child/node bounds")
        # Retain the actual traversal ancestry; do not walk into another app
        # through parent/relation references or touch selection/focus methods.
        for index in range(children - 1, -1, -1):
            stack.append((node.get_child_at_index(index), route + [index],
                          ancestors + [(node, route)]))
    if app.get_process_id() != args.pid:
        raise RuntimeError("Application PID changed during observation")
    if len(matches) != 1:
        raise RuntimeError(f"Expected one visible 70 pt/60 pt text field; found {len(matches)}")
    node, route, ancestors, text = matches[0]
    field = describe(node, route)
    field["text"] = text
    parents = [describe(parent, parent_route) for parent, parent_route in ancestors]

    def rectangle(row):
        value = row.get("screen", {})
        if all(isinstance(value.get(key), int) for key in ("x", "y", "width", "height")):
            if value["width"] > 1 and value["height"] > 1 and value["x"] > -16384 and value["y"] > -16384:
                return [value["x"], value["y"], value["x"] + value["width"], value["y"] + value["height"]]
        return None

    raw = rectangle(field)
    intersection = raw[:] if raw else None
    included = []
    if intersection:
        for parent in parents:
            rect = rectangle(parent)
            if rect:
                included.append(parent["tree_path"])
                intersection = [max(intersection[0], rect[0]), max(intersection[1], rect[1]),
                                min(intersection[2], rect[2]), min(intersection[3], rect[3])]
    center = [(raw[0] + raw[2]) / 2, (raw[1] + raw[3]) / 2] if raw else None
    nonempty = bool(intersection and intersection[2] > intersection[0] and intersection[3] > intersection[1])
    result = {"kind": "read-only-font-field-bounds", "pid": args.pid,
              "application_name": app.get_name(), "visited_nodes": visited,
              "field": field, "ancestors": parents,
              "geometry": {"raw_screen_center": center,
                           "ancestor_intersection_ltrb": intersection,
                           "intersection_nonempty": nonempty,
                           "intersection_ancestor_paths": included,
                           "center_inside_intersection": bool(nonempty and center and
                               intersection[0] <= center[0] < intersection[2] and
                               intersection[1] <= center[1] < intersection[3])},
              "limitations": ["Sequential observations are not an atomic snapshot.",
                  "Ancestor bounds intersection is a diagnostic approximation, not toolkit clipping or occlusion proof.",
                  "Raw Screen center is not necessarily the driver's rebased Window-coordinate center; both extents are retained.",
                  "D-Bus identity is null when this GI build does not expose it; tree_path is traversal position, not stable identity."]}
    signal.alarm(0)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"kind": "read-only-font-field-bounds", "error": str(error)}), file=sys.stderr)
        raise SystemExit(1)
