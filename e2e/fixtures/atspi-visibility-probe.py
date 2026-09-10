"""Read-only diagnostics for an owned Calc Validity dialog; never sends input."""
import json
import gi

gi.require_version('Atspi', '2.0')
from gi.repository import Atspi


def read(callback):
    try:
        return callback()
    except Exception as error:
        return {'error': str(error)}


def target(accessible):
    return {'name': read(accessible.get_name), 'role': read(accessible.get_role_name)}


desktop = Atspi.get_desktop(0)
dialogs = []
for index in range(desktop.get_child_count()):
    application = desktop.get_child_at_index(index)
    for frame_index in range(application.get_child_count()):
        frame = application.get_child_at_index(frame_index)
        if frame.get_name() == 'Validity':
            dialogs.append((application, frame))
if len(dialogs) != 1:
    raise SystemExit(f'Expected one Validity dialog on disposable desktop; found {len(dialogs)}')

application, dialog = dialogs[0]
nodes = []


def walk(accessible, depth):
    if depth > 20 or len(nodes) > 500:
        raise RuntimeError('Dialog exceeds diagnostic bounds')
    states = accessible.get_state_set()
    interfaces = list(accessible.get_interfaces())
    row = {**target(accessible), 'depth': depth, 'interfaces': interfaces,
           'description': read(accessible.get_description),
           'showing': states.contains(Atspi.StateType.SHOWING),
           'visible': states.contains(Atspi.StateType.VISIBLE),
           'enabled': states.contains(Atspi.StateType.ENABLED),
           'sensitive': states.contains(Atspi.StateType.SENSITIVE),
           'focused': states.contains(Atspi.StateType.FOCUSED),
           'selected': states.contains(Atspi.StateType.SELECTED)}
    row['relations'] = read(lambda: [
        {'type': relation.get_relation_type().value_nick,
         'targets': [target(relation.get_target(i)) for i in range(relation.get_n_targets())]}
        for relation in accessible.get_relation_set()])
    if 'Text' in interfaces:
        row['text'] = read(lambda: Atspi.Text.get_text(accessible, 0, -1))
    if 'Component' in interfaces:
        def bounds():
            rect = accessible.get_component_iface().get_extents(Atspi.CoordType.SCREEN)
            return {'x': rect.x, 'y': rect.y, 'width': rect.width, 'height': rect.height}
        row['bounds'] = read(bounds)
    nodes.append(row)
    for index in range(accessible.get_child_count()):
        walk(accessible.get_child_at_index(index), depth + 1)


walk(dialog, 0)
print(json.dumps({'kind': 'read-only-atspi-diagnostic', 'application': target(application),
                  'nodes': nodes}, indent=2))
