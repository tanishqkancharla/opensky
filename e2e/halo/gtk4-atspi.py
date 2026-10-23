"""Read-only, bounded raw AT-SPI evidence for the exact owned fixture PID."""
import gi, os, json
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi
pid = int(os.environ["HALO_GTK4_PID"])
desktop = Atspi.get_desktop(0)
apps = [desktop.get_child_at_index(i) for i in range(desktop.get_child_count())]
apps = [app for app in apps if app.get_process_id() == pid]
assert len(apps) == 1, "Exact owned AT-SPI application required"
rows = []
def walk(node, path):
    assert len(rows) < 200, "Bounded owned tree exceeded"
    row = {"path": path, "name": node.get_name(), "role": node.get_role_name(),
           "states": [state.value_nick for state in node.get_state_set().get_states()]}
    component = node.get_component_iface()
    if component:
        row["extents"] = {}
        for name, coord in [("screen", Atspi.CoordType.SCREEN), ("window", Atspi.CoordType.WINDOW)]:
            rect = component.get_extents(coord)
            row["extents"][name] = [rect.x, rect.y, rect.width, rect.height]
    rows.append(row)
    for i in range(node.get_child_count()):
        child = node.get_child_at_index(i)
        if child is not None:
            walk(child, path + [i])
walk(apps[0], [])
print(json.dumps({"pid": pid, "readOnly": True, "nodes": rows}))
