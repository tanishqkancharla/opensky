#!/usr/bin/env python3
"""Read an existing desktop run's evidence without launching or changing anything."""

import argparse
from collections import Counter
import json
import math
from pathlib import Path
import re
import sys
from statistics import median
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
    all_timings = []

    def timing_summary(rows):
        methods = {}
        for method in sorted({row["method"] for row in rows}):
            samples = [row for row in rows if row["method"] == method]
            durations = [row["elapsedMs"] for row in samples]
            methods[method] = {
                "calls": len(samples),
                "passed": sum(row["passed"] for row in samples),
                "failed": sum(not row["passed"] for row in samples),
                "totalMs": round(sum(durations), 3),
                "medianMs": round(median(durations), 3),
                "maxMs": round(max(durations), 3),
            }
        return methods

    def read_timings(evidence):
        path = evidence / "method-timing.jsonl" if evidence else None
        if path is None or not path.exists():
            return {"status": "unavailable", "methods": {}}
        rows = []
        valid = True
        try:
            for number, line in enumerate(path.read_text().splitlines(), 1):
                if not line.strip():
                    continue
                try:
                    row = json.loads(line)
                    if (not isinstance(row, dict) or not isinstance(row.get("method"), str)
                        or not row["method"] or type(row.get("elapsedMs")) not in (int, float)
                        or not math.isfinite(row["elapsedMs"]) or row["elapsedMs"] < 0
                        or type(row.get("passed")) is not bool):
                        raise ValueError("invalid method timing record")
                    rows.append(row)
                except ValueError as error:
                    valid = False
                    issues.append(f"{path.relative_to(root)}:{number}: {error}")
        except OSError as error:
            valid = False
            issues.append(f"{path.relative_to(root)}: {error}")
        all_timings.extend(rows)
        return {"status": "recorded" if valid and rows else "empty" if valid else "incomplete", "methods": timing_summary(rows)}

    for suite in (report or {}).get("testResults", []):
        for test in suite.get("assertionResults", []):
            title = test.get("fullName") or test.get("title", "unknown")
            match = re.match(r"([A-Z]+-L\d+):", title)
            candidates = [root / kind / match.group(1) for kind in ("setup", "typing") if (root / kind / match.group(1)).is_dir()] if match else []
            evidence = candidates[0] if len(candidates) == 1 else None
            status = test.get("status", "unknown")
            cleanup = None
            if status not in ("skipped", "pending", "todo"):
                if evidence is not None:
                    cleanup = read_json(evidence / "cleanup.json")
                else:
                    issues.append(f"Missing or ambiguous setup/typing artifact mapping for executed test: {title}")
            tests.append({
                "name": title,
                "status": status,
                "durationSeconds": round(test["duration"] / 1000, 3) if isinstance(test.get("duration"), (int, float)) else None,
                "cleanup": cleanup,
                "evidenceDirectory": str(evidence.relative_to(root)) if evidence else None,
                "methodTimings": read_timings(evidence) if status not in ("skipped", "pending", "todo") else {"status": "not-run", "methods": {}},
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
        "methodTimings": {
            "scope": "Recorded public SDK calls in executed tests, including fixture setup and cleanup; not agent REPL calls or total wall time",
            "testsWithRecords": sum(test["methodTimings"]["status"] == "recorded" for test in executed),
            "executedTests": len(executed),
            "methods": timing_summary(all_timings),
        },
        "savedFormulas": sheets,
        "formulaFilter": formula,
        "geometryDiagnostics": dict(rebases),
        "evidenceIssues": issues,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path, help="Run directory containing results.json and setup/ or typing/")
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
        timing = result["methodTimings"]
        print(f"  Method timing records: {timing['testsWithRecords']}/{timing['executedTests']} executed tests (missing records are unknown, not zero calls)")
        for method, metric in timing["methods"].items():
            print(f"    {method}: {metric['calls']} calls ({metric['failed']} failed), median {metric['medianMs']} ms, total {metric['totalMs']} ms")
        if timing["methods"]:
            print(f"    Scope: {timing['scope']}")
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
