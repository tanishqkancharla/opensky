#!/usr/bin/python3
"""Read C10/C11/C12 identity/geometry in one owned Calc app; never sends input."""
import argparse
import json
import signal

ACC = 'org.a11y.atspi.Accessible'
TABLE = 'org.a11y.atspi.Table'
CELL = 'org.a11y.atspi.TableCell'
COMPONENT = 'org.a11y.atspi.Component'
TITLE = 'Student_Level_Fill_Blank.xlsx'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pid', type=int)
    args = parser.parse_args()
    if args.pid <= 0:
        parser.error('PID must be positive')
    import dbus

    def timeout(_signal, _frame):
        raise TimeoutError('Read-only cell probe exceeded 60 seconds')

    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(60)
    session = dbus.SessionBus()
    address = dbus.Interface(session.get_object('org.a11y.Bus', '/org/a11y/bus'),
                             'org.a11y.Bus').GetAddress(timeout=3)
    bus = dbus.bus.BusConnection(str(address))
    daemon = dbus.Interface(bus.get_object('org.freedesktop.DBus', '/org/freedesktop/DBus'),
                            'org.freedesktop.DBus')

    def obj(ref):
        return bus.get_object(str(ref[0]), str(ref[1]), introspect=False)

    def call(ref, interface, method, *values):
        return getattr(dbus.Interface(obj(ref), interface), method)(*values, timeout=3)

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
        return int(daemon.GetConnectionUnixProcessID(str(ref[0]), timeout=3))

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
        cells.append(data)
    if owner_pid(app) != args.pid or str(prop(frame, ACC, 'Name')) != frame_data['name']:
        raise ValueError('Owned application/frame changed during probe')
    print(json.dumps({'kind': 'read-only-calc-cell-identity', 'pid': args.pid,
                      'application': identity(app), 'frame': frame_data, 'table': table_data,
                      'visitedNodes': len(seen), 'cells': cells,
                      'limitations': ['Sequential D-Bus observations are not atomic.',
                          'Separate invocations report stable external bus/path strings; no previous proxy is retained.',
                          'Geometry is raw toolkit Screen/Window output, not driver-adjusted click coordinates.']}, indent=2))
    signal.alarm(0)


if __name__ == '__main__':
    main()
