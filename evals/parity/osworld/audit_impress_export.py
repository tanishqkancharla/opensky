"""Audit OSWorld reference compatibility with the real LibreOffice exporter.

Pre-campaign diagnostic only. Never repair an agent artifact, overwrite source
assets, change task checks, or replace historical/campaign scores. Each export
uses a disposable profile and exits before its artifact is read by the grader.
"""
import argparse
import contextlib
import hashlib
import json
import os
import signal
import shutil
import subprocess
import tempfile
from pathlib import Path

from desktop_env.evaluators.metrics.slides import compare_pptx_files
from score_extended import score_extended

ROOT = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def export_copy(office, source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / source.name
    if output.exists():
        raise FileExistsError(output)
    # Retain recovery evidence rather than deleting a possibly live profile if
    # an abnormal exporter shutdown cannot be proved.
    with contextlib.nullcontext(tempfile.mkdtemp(prefix="opensky-reference-export-")) as temporary:
        profile = Path(temporary)
        process = subprocess.Popen(
            [str(office), "--headless", f"-env:UserInstallation={profile.as_uri()}",
             "--convert-to", "pptx", "--outdir", str(destination), str(source)],
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            start_new_session=True,
        )
        timed_out = False
        try:
            stdout, stderr = process.communicate(timeout=60)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(process.pid, signal.SIGTERM)
            stdout, stderr = process.communicate(timeout=10)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=10)
            # Never delete a profile while an exporter descendant still owns it.
            try:
                os.killpg(process.pid, 0)
            except ProcessLookupError:
                pass
            else:
                os.killpg(process.pid, signal.SIGTERM)
                (destination / "cleanup-error.json").write_text(json.dumps({
                    "pid": process.pid, "profile": str(profile), "verifiedExited": False,
                }, indent=2))
                raise RuntimeError("Exporter descendants remained alive after conversion")
        receipt = {"source": str(source), "sourceSha256": digest(source),
                   "output": str(output), "pid": process.pid,
                   "exitCode": process.returncode, "timedOut": timed_out,
                   "stdout": stdout, "stderr": stderr, "ownedProcessGroupExited": True}
        shutil.rmtree(profile)
        receipt["temporaryProfileRemoved"] = True
        (destination / f"{source.stem}.export.json").write_text(json.dumps(receipt, indent=2))
        if timed_out or process.returncode or not output.is_file():
            raise RuntimeError(f"Reference export failed: {source.name}")
        receipt["outputSha256"] = digest(output)
    (destination / f"{source.stem}.export.json").write_text(json.dumps(receipt, indent=2))
    return output


def audit(task_id, office, destination, actual=None):
    manifest = json.loads((ROOT / "manifest.json").read_text())
    task = next(task for task in manifest["tasks"] if task["id"] == task_id)
    if task["category"] != "libreoffice_impress":
        raise ValueError("This diagnostic supports Impress only")
    pins = {asset["file"]: asset["sha256"] for asset in task["assets"]}
    for name, expected_hash in pins.items():
        if digest(ROOT / task_id / name) != expected_hash:
            raise ValueError(f"Pinned source changed: {name}")
    destination.mkdir(parents=True, exist_ok=False)
    upstream = json.loads((ROOT / task_id / "upstream-task.json").read_text())["evaluator"]
    references = upstream["expected"] if isinstance(upstream["expected"], list) else [upstream["expected"]]
    reference_root = destination / "exported-references"
    for name in dict.fromkeys(reference["dest"] for reference in references):
        export_copy(office, ROOT / task_id / name, reference_root / task_id)
    source = ROOT / task_id / task["inputFile"]
    unchanged = export_copy(office, source, destination / "unchanged-input")
    result = {
        "taskId": task_id, "diagnosticOnly": True, "modelSpend": 0,
        "office": {"executable": str(office), "sha256": digest(office),
                   "version": subprocess.check_output([str(office), "--version"], text=True, timeout=10).strip()},
        "neutralSourceSelfComparison": compare_pptx_files(str(source), str(source), enable_debug=False),
        "neutralNoEditExportComparison": compare_pptx_files(str(unchanged), str(source), enable_debug=False),
        "unchangedTaskOriginalReference": score_extended(task, unchanged),
        "unchangedTaskExportedReference": score_extended(task, unchanged, reference_root=reference_root),
        "historicalScoresChanged": False,
    }
    if actual:
        before = digest(actual)
        result["actualSha256"] = before
        result["actualOriginalReference"] = score_extended(task, actual)
        result["actualExportedReferenceDiagnostic"] = score_extended(task, actual, reference_root=reference_root)
        if digest(actual) != before:
            raise RuntimeError("Agent artifact changed during read-only grading")
    (destination / "audit.json").write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", required=True)
    parser.add_argument("--libreoffice", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--actual", type=Path)
    args = parser.parse_args()
    print(json.dumps(audit(args.task, args.libreoffice.resolve(), args.output.resolve(),
                           args.actual.resolve() if args.actual else None), indent=2))
