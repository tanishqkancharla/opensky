#!/usr/bin/env python3
"""Read an existing desktop run's evidence without launching or changing anything."""

import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


def summarize(root: Path, formula: str | None) -> dict:
    issues = []

    def read_json(path: Path):
        try:
            return json.loads(path.read_text())
        except (OSError, ValueError) as error:
            issues.append(f"{path.relative_to(root)}: {error}")
            return None

    report = read_json(root / "results.json")
    identity = read_json(root / "driver-identity.json")
    tests = []
    for suite in (report or {}).get("testResults", []):
        for test in suite.get("assertionResults", []):
            title = test.get("fullName") or test.get("title", "unknown")
            match = re.match(r"([A-Z]+-L\d+):", title)
            evidence = root / "setup" / match.group(1) if match else None
            status = test.get("status", "unknown")
            cleanup = None
            if status not in ("skipped", "pending", "todo"):
                if evidence is not None:
                    cleanup = read_json(evidence / "cleanup.json")
                else:
                    issues.append(f"No setup artifact mapping for executed test: {title}")
            tests.append({
                "name": title,
                "status": status,
                "durationSeconds": round(test["duration"] / 1000, 3) if isinstance(test.get("duration"), (int, float)) else None,
                "cleanup": cleanup,
                "failure": "\n".join(test.get("failureMessages", [])).split("\n    at ")[0] or None,
            })

    sheets = []
    namespace = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    for path in sorted(root.glob("setup/*/*.xlsx")):
        try:
            with zipfile.ZipFile(path) as archive:
                for member in sorted(archive.namelist()):
                    if not re.fullmatch(r"xl/worksheets/sheet\d+\.xml", member):
                        continue
                    for cell in ET.fromstring(archive.read(member)).findall(".//s:c", namespace):
                        expression = cell.find("s:f", namespace)
                        if expression is None or (formula is not None and expression.text != formula):
                            continue
                        value = cell.find("s:v", namespace)
                        sheets.append({"file": str(path.relative_to(root)), "sheet": member, "cell": cell.get("r"), "formula": expression.text, "value": value.text if value is not None else None})
        except (OSError, ValueError, zipfile.BadZipFile, ET.ParseError) as error:
            issues.append(f"{path.relative_to(root)}: {error}")

    rebases = Counter()
    log = root / "driver.log"
    if log.exists():
        with log.open(errors="replace") as stream:
            for line in stream:
                match = re.search(r"element bounds: (.+)", line)
                if match:
                    rebases[match.group(1).strip()] += 1

    executed = [test for test in tests if test["status"] not in ("skipped", "pending", "todo")]
    return {
        "artifact": str(root.resolve()),
        "driverIdentity": identity,
        "reportedSuccess": (report or {}).get("success"),
        "completeAndPassed": bool(executed) and not issues and (report or {}).get("success") is True and all(test["status"] == "passed" and (test["cleanup"] or {}).get("status") == "passed" and (test["cleanup"] or {}).get("verifiedExited") is True for test in executed),
        "tests": tests,
        "savedFormulas": sheets,
        "formulaFilter": formula,
        "geometryDiagnostics": dict(rebases),
        "evidenceIssues": issues,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path, help="Downloaded run directory containing results.json and setup/")
    parser.add_argument("--formula", help="Only show this exact saved formula, without the leading = (e.g. B2-C2)")
    parser.add_argument("--json", action="store_true", help="Emit the complete machine-readable summary")
    args = parser.parse_args()
    result = summarize(args.artifact, args.formula)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        identity = result["driverIdentity"] or {}
        print(f"Run: {result['artifact']}")
        print(f"Driver source: {identity.get('source', 'UNKNOWN')}")
        print("Evidence: " + ("executed tests passed and cleanup verified" if result["completeAndPassed"] else "failed or incomplete; inspect details below"))
        for test in result["tests"]:
            if test["status"] in ("skipped", "pending", "todo"):
                print(f"  {test['status'].upper()}: {test['name']}")
                continue
            cleanup = test["cleanup"] or {}
            cleaned = cleanup.get("status") == "passed" and cleanup.get("verifiedExited") is True
            print(f"  {test['status'].upper()}: {test['name']} | {test['durationSeconds']}s | cleanup {'verified' if cleaned else 'NOT VERIFIED'}")
            if test["failure"]:
                print(f"    {test['failure']}")
        for saved in result["savedFormulas"][:20]:
            print(f"  Saved {saved['file']} / {saved['sheet']} / {saved['cell']}: ={saved['formula']} → {saved['value']}")
        if len(result["savedFormulas"]) > 20:
            print(f"  {len(result['savedFormulas']) - 20} additional saved formulas; use --formula or --json.")
        if args.formula and not result["savedFormulas"]:
            print(f"  No saved formula matched {args.formula!r}.")
        for diagnostic, count in result["geometryDiagnostics"].items():
            print(f"  Geometry ({count}×): {diagnostic}")
        for issue in result["evidenceIssues"]:
            print(f"  Missing/unreadable evidence: {issue}")
    return 0 if result["completeAndPassed"] else 1


if __name__ == "__main__":
    sys.exit(main())
