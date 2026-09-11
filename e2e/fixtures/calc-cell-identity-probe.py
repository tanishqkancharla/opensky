#!/usr/bin/python3
"""Read C10/C11/C12 identity/geometry in one owned Calc app; never sends input."""
import argparse
import json
import math
import os
import re
import signal
import subprocess

ACC = 'org.a11y.atspi.Accessible'
TABLE = 'org.a11y.atspi.Table'
CELL = 'org.a11y.atspi.TableCell'
COMPONENT = 'org.a11y.atspi.Component'
TITLE = 'Student_Level_Fill_Blank.xlsx'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pid', type=int)
    parser.add_argument('xid', help='Exact owned X11 window ID')
    args = parser.parse_args()
    if args.pid <= 0:
        parser.error('PID must be positive')
    if not re.fullmatch(r'(?:0x[0-9a-fA-F]+|[0-9]+)', args.xid):
        parser.error('XID must be a decimal or hexadecimal window ID')
    import gi
    gi.require_version('Gio', '2.0')
    from gi.repository import Gio, GLib

    def timeout(_signal, _frame):
        raise TimeoutError('Read-only cell probe exceeded 20 seconds')

    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(20)
    def xcommand(*args):
        return subprocess.check_output(args, timeout=3, text=True,
                                       env={**os.environ, 'LC_ALL': 'C'})

    if int(xcommand('xdotool', 'getwindowpid', args.xid).strip()) != args.pid:
        raise ValueError('Explicit X11 window belongs to another process')
    window_info = xcommand('xwininfo', '-id', args.xid)
    def absolute(axis):
        matches = re.findall(r'Absolute upper-left ' + axis + r':\s*(-?\d+)', window_info)
        if len(matches) != 1:
            raise ValueError('Missing exact X11 client origin')
        return int(matches[0])
    client_origin = [absolute('X'), absolute('Y')]
    session = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    address = session.call_sync('org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus',
                                'GetAddress', None, None, Gio.DBusCallFlags.NONE,
                                3000, None).unpack()[0]
    bus = Gio.DBusConnection.new_for_address_sync(
        address, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT |
        Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
    signatures = {'Get': '(ss)', 'GetChildAtIndex': '(i)', 'GetAccessibleAt': '(ii)',
                  'GetExtents': '(u)', 'GetConnectionUnixProcessID': '(s)',
                  'GetAccessibleAtPoint': '(iiu)'}

    def call(ref, interface, method, *values):
        parameters = GLib.Variant(signatures[method], values) if values else None
        reply = bus.call_sync(str(ref[0]), str(ref[1]), interface, method,
                              parameters, None, Gio.DBusCallFlags.NONE, 3000, None)
        # D-Bus method replies are outer tuples. Unwrap one return value only:
        # GetAccessibleAt/GetExtents return one struct; GetRowColumnSpan has
        # five separate returns and must retain its complete tuple.
        result = reply.unpack()
        return result[0] if len(result) == 1 else result

    def prop(ref, interface, key):
        return call(ref, 'org.freedesktop.DBus.Properties', 'Get', interface, key)

    def identity(ref):
        return {'bus': str(ref[0]), 'path': str(ref[1])}

    def optional(callback):
        try:
            return callback()
        except TimeoutError:
            raise
        except Exception as error:
            return {'error': str(error)}

    def owner_pid(ref):
        return int(call(('org.freedesktop.DBus', '/org/freedesktop/DBus'),
                        'org.freedesktop.DBus', 'GetConnectionUnixProcessID', str(ref[0])))

    def children(ref):
        count = int(prop(ref, ACC, 'ChildCount'))
        if not 0 <= count <= 512:
            raise ValueError('Non-table child inventory exceeds bound')
        return [call(ref, ACC, 'GetChildAtIndex', i) for i in range(count)]

    def describe(ref):
        interfaces = list(map(str, call(ref, ACC, 'GetInterfaces')))
        result = {**identity(ref), 'name': str(prop(ref, ACC, 'Name')),
                  'role': str(call(ref, ACC, 'GetRoleName')), 'interfaces': interfaces,
                  'stateWords': optional(lambda: list(map(int, call(ref, ACC, 'GetState'))))}
        if COMPONENT in interfaces:
            result['screen'] = optional(lambda: list(map(int, call(ref, COMPONENT, 'GetExtents', 0))))
            result['window'] = optional(lambda: list(map(int, call(ref, COMPONENT, 'GetExtents', 1))))
        return result

    registry = ('org.a11y.atspi.Registry', '/org/a11y/atspi/accessible/root')
    # Outside the owned application, inspect only connection PID metadata.
    apps = [ref for ref in children(registry) if owner_pid(ref) == args.pid]
    if len(apps) != 1:
        raise ValueError(f'Expected exactly one owned app for PID {args.pid}; found {len(apps)}')
    app = apps[0]
    frames = [(ref, describe(ref)) for ref in children(app)]
    frames = [(ref, data) for ref, data in frames
              if data['role'] == 'frame' and TITLE in data['name']]
    if len(frames) != 1:
        raise ValueError('Expected exactly one original-workbook frame')
    frame, frame_data = frames[0]
    stack = [(frame, 0)]
    seen, tables = set(), []
    while stack:
        ref, depth = stack.pop()
        key = (str(ref[0]), str(ref[1]))
        if key in seen:
            continue
        seen.add(key)
        if len(seen) > 3000 or depth > 32:
            raise ValueError('Owned frame traversal exceeds bounds')
        if owner_pid(ref) != args.pid:
            raise ValueError('Traversal crossed owned process boundary')
        interfaces = list(map(str, call(ref, ACC, 'GetInterfaces')))
        role = str(call(ref, ACC, 'GetRoleName')).lower()
        if TABLE in interfaces:
            data = describe(ref)
            if data['name'] == 'Sheet Sheet1':
                tables.append((ref, data))
            # Never enumerate any table's massive virtual child inventory.
            continue
        if role in ('menu', 'menu bar', 'menu item', 'popup menu', 'tool bar'):
            continue
        stack.extend((child, depth + 1) for child in reversed(children(ref)))
    if len(tables) != 1:
        raise ValueError('Expected exactly one Sheet Sheet1 table in original workbook')
    table, table_data = tables[0]
    frame_screen = frame_data.get('screen')
    if not isinstance(frame_screen, list) or len(frame_screen) != 4:
        raise ValueError('Frame Screen geometry unavailable')
    candidate = ([client_origin[0] - frame_screen[0], client_origin[1] - frame_screen[1]]
                 if abs(frame_screen[0]) <= 2 and abs(frame_screen[1]) <= 2 else [0, 0])

    def hit_test(point, expected):
        hit = call(table, COMPONENT, 'GetAccessibleAtPoint', point[0], point[1], 0)
        result = identity(hit)
        if not str(hit[0]) or str(hit[1]) == '/org/a11y/atspi/null':
            return {**result, 'null': True, 'matchesRequestedIdentity': False}
        if owner_pid(hit) != args.pid:
            raise ValueError('Hit test crossed owned process boundary')
        result.update({'name': str(prop(hit, ACC, 'Name')),
                       'role': str(call(hit, ACC, 'GetRoleName')),
                       'position': optional(lambda: list(map(int, prop(hit, CELL, 'Position')))),
                       'matchesRequestedIdentity': identity(hit) == identity(expected)})
        return result

    def pixel(value):
        # Match Rust f64::round used by indexed pointer delivery (ties away from zero).
        return int(math.copysign(math.floor(abs(value) + 0.5), value))

    cells = []
    for row in (9, 10, 11):
        ref = call(table, TABLE, 'GetAccessibleAt', row, 2)
        if owner_pid(ref) != args.pid:
            raise ValueError('Table cell belongs to another process')
        data = describe(ref)
        data['requestedCell'] = f'C{row + 1}'
        data['requestedRowColumn'] = [row, 2]
        data['nameMatchesRequestedCell'] = data['name'] == data['requestedCell']
        data['tableCellPosition'] = optional(lambda: list(map(int, prop(ref, CELL, 'Position'))))

        def span():
            value = call(ref, CELL, 'GetRowColumnSpan')
            return {'valid': bool(value[0]), 'row': int(value[1]), 'column': int(value[2]),
                    'rowSpan': int(value[3]), 'columnSpan': int(value[4])}

        data['tableCellRowColumnSpan'] = optional(span)
        data['indexInParent'] = optional(lambda: int(call(ref, ACC, 'GetIndexInParent')))
        screen = data.get('screen')
        if isinstance(screen, list) and len(screen) == 4 and screen[2] > 1 and screen[3] > 1:
            center = [screen[0] + screen[2] / 2, screen[1] + screen[3] / 2]
            points = {'rawScreenCenter': [pixel(v) for v in center],
                      'candidateRebasedCenter': [pixel(center[i] + candidate[i]) for i in (0, 1)]}
            data['hitTests'] = {name: {'screenPoint': point,
                                     'result': optional(lambda point=point: hit_test(point, ref))}
                                for name, point in points.items()}
        else:
            data['hitTests'] = {'error': 'No usable raw Screen geometry'}
        cells.append(data)
    if owner_pid(app) != args.pid or str(prop(frame, ACC, 'Name')) != frame_data['name']:
        raise ValueError('Owned application/frame changed during probe')
    if int(xcommand('xdotool', 'getwindowpid', args.xid).strip()) != args.pid:
        raise ValueError('Explicit X11 window ownership changed')
    print(json.dumps({'kind': 'read-only-calc-cell-identity', 'pid': args.pid, 'xid': args.xid,
                      'x11ClientOrigin': client_origin, 'frameRebaseCandidate': candidate,
                      'application': identity(app), 'frame': frame_data, 'table': table_data,
                      'visitedNodes': len(seen), 'cells': cells,
                      'limitations': ['Sequential D-Bus observations are not atomic.',
                          'Separate invocations report stable external bus/path strings; no previous proxy is retained.',
                          'Candidate is frame-derived; driver per-component suppression is not assumed.',
                          'Hit testing reads toolkit spatial lookup; it does not inject a click or independently prove physical delivery.']}, indent=2))
    signal.alarm(0)


if __name__ == '__main__':
    main()
