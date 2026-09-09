"""Exercise the content guard on pinned real XLSX data without running a desktop."""
import argparse
import contextlib
import hashlib
import io
import json
from pathlib import Path
import posixpath
import tempfile
import xml.etree.ElementTree as ET
import zipfile

from score_extended import ROOT, compare_table, content_matches, score_extended

TASK_ID = "035f41ba-6653-43ab-aa63-c86d449d62e5"
GOLD_NAME = "5_IncomeStatement2_gt1.xlsx"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sheet_member(archive, sheet_name):
    sheets = ET.fromstring(archive.read("xl/workbook.xml")).find("s:sheets", NS)
    sheet = next(sheet for sheet in sheets if sheet.get("name") == sheet_name)
    relationship_id = sheet.get("{" + NS["r"] + "}id")
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target = next(item.get("Target") for item in relationships if item.get("Id") == relationship_id)
    return target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)


def copy_with_xml_change(source, destination, member_name, change):
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(destination, "w") as output:
        for member in original.infolist():
            data = original.read(member.filename)
            if member.filename == member_name:
                root = ET.fromstring(data)
                change(root)
                data = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            output.writestr(member, data)


def reorder_sheets(root):
    sheets = root.find("s:sheets", NS)
    assert len(sheets) == 2
    sheets[:] = list(reversed(list(sheets)))


def damage_profit(root):
    value = root.find('.//s:c[@r="J2"]/s:v', NS)
    assert value is not None and value.text == "55000"
    value.text = "55001"


def add_intermediate_value(root):
    row = root.find('.//s:sheetData/s:row[@r="2"]', NS)
    assert row is not None
    cell = row.find('s:c[@r="E2"]', NS)
    if cell is None:
        cell = ET.Element("{" + NS["s"] + "}c", {"r": "E2"})
        # Keep serialized cells in worksheet column order.
        row.insert(next(i for i, existing in enumerate(row) if existing.get("r") == "F2"), cell)
    assert cell.find("s:v", NS) is None or cell.find("s:v", NS).text is None
    cell[:] = []
    cell.set("t", "n")
    ET.SubElement(cell, "{" + NS["s"] + "}v").text = "74000"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-root", type=Path, default=ROOT)
    args = parser.parse_args()
    task = next(task for task in json.loads((ROOT / "manifest.json").read_text())["tasks"]
                if task["id"] == TASK_ID)
    asset = next(asset for asset in task["assets"] if asset["file"] == GOLD_NAME)
    gold = args.reference_root / TASK_ID / GOLD_NAME
    original_hash = sha256(gold)
    assert original_hash == asset["sha256"], "Canonical Calc reference does not match its pin"
    with zipfile.ZipFile(gold) as archive:
        data_member = sheet_member(archive, "Sheet1")
    with tempfile.TemporaryDirectory(prefix="opensky-named-sheet-check-") as temporary:
        root = Path(temporary)
        reordered = root / "reordered.xlsx"
        damaged = root / "damaged-J2.xlsx"
        extra = root / "extra-E2.xlsx"
        copy_with_xml_change(gold, reordered, "xl/workbook.xml", reorder_sheets)
        copy_with_xml_change(gold, damaged, data_member, damage_profit)
        copy_with_xml_change(gold, extra, data_member, add_intermediate_value)
        results = {}
        for name, path, expected in (("gold", gold, True), ("reordered", reordered, True),
                                     ("damaged_J2", damaged, False), ("extra_E2", extra, False)):
            result = score_extended(task, path, reference_root=args.reference_root)
            assert "error" not in result, (name, result)
            assert result["taskSuccess"] is expected, (name, result)
            assert result["contentMatches"] is expected, (name, result)
            assert result["upstreamScore"] == int(expected), (name, result)
            results[name] = {"sha256": sha256(path), "outcome": result}
        with contextlib.redirect_stdout(io.StringIO()):
            ordered_score = compare_table(str(reordered), str(gold), rules=[{"type": "sheet_name"}])
        assert ordered_score == 0, "Explicit upstream sheet-order requirements must remain enforced"
        assert content_matches(task, reordered, gold)
        results["explicit_upstream_order_rule"] = {"upstreamScore": ordered_score,
                                                    "contentMatches": True, "taskSuccess": False}
    assert not root.exists(), "Temporary workbook controls were not cleaned up"
    assert sha256(gold) == original_hash, "Original reference was modified"
    print(json.dumps({"status": "passed", "referenceSha256": original_hash,
                      "guardSha256": sha256(ROOT / "score_extended.py"),
                      "originalReferenceUnchanged": True, "temporaryFilesCleaned": True,
                      "cases": results}))


if __name__ == "__main__":
    main()
