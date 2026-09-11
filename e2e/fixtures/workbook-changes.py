"""Read decoded saved XLSX changes with the Python standard library only."""
import json
import math
import posixpath
import sys
import xml.etree.ElementTree as ET
import zipfile

S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def snapshot(path):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(node.text or '' for node in item.iter(S + 't'))
                      for item in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        links = {item.get('Id'): item for item in
                 ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        sheets = {}
        for sheet in workbook.find(S + 'sheets'):
            name = sheet.get('name')
            if name in sheets:
                raise ValueError('Duplicate sheet name')
            link = links[sheet.get(R + 'id')]
            if link.get('TargetMode') == 'External':
                raise ValueError('External worksheet relationship')
            target = link.get('Target')
            member = posixpath.normpath(target.lstrip('/') if target.startswith('/')
                                      else posixpath.join('xl', target))
            if member.startswith('../') or '\\' in member:
                raise ValueError('Invalid worksheet member')
            cells = {}
            for cell in ET.fromstring(archive.read(member)).iter(S + 'c'):
                address = cell.get('r')
                if not address or address in cells:
                    raise ValueError('Missing or duplicate cell address')
                raw = cell.findtext(S + 'v')
                kind = cell.get('t')
                if kind == 'inlineStr':
                    value = ''.join(node.text or '' for node in cell.iter(S + 't'))
                elif raw is None:
                    value = None
                elif kind == 's':
                    index = int(raw)
                    if not 0 <= index < len(shared):
                        raise ValueError('Invalid shared-string reference')
                    value = shared[index]
                elif kind == 'b':
                    if raw not in ('0', '1'):
                        raise ValueError('Invalid boolean cell')
                    value = raw == '1'
                elif kind == 'e':
                    value = {'error': raw}
                elif kind in ('str', 'd'):
                    value = raw
                elif kind in (None, 'n'):
                    value = float(raw)
                    if not math.isfinite(value):
                        raise ValueError('Nonfinite numeric cell')
                    if value.is_integer():
                        value = int(value)
                else:
                    raise ValueError('Unsupported cell type: ' + kind)
                formula = cell.find(S + 'f')
                if formula is not None:
                    value = {'formula': formula.text or '',
                             'attributes': dict(formula.attrib), 'cachedValue': value}
                if value is not None:
                    cells[address] = value
            sheets[name] = cells
        return sheets


def changes(original, saved):
    before, after = snapshot(original), snapshot(saved)
    return {'sheetNamesUnchanged': list(before) == list(after), 'changes': [
        {'sheet': sheet, 'cell': cell, 'before': before.get(sheet, {}).get(cell),
         'after': after.get(sheet, {}).get(cell)}
        for sheet in sorted(before.keys() | after.keys())
        for cell in sorted(before.get(sheet, {}).keys() | after.get(sheet, {}).keys())
        # JSON distinguishes boolean true from numeric 1, unlike Python ==.
        if json.dumps(before.get(sheet, {}).get(cell), sort_keys=True) !=
           json.dumps(after.get(sheet, {}).get(cell), sort_keys=True)]}


if __name__ == '__main__':
    print(json.dumps(changes(sys.argv[1], sys.argv[2]), allow_nan=False))
