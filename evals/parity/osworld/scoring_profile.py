"""Freeze and verify explicit grading inputs before dispatching an agent.

Preparation only copies already validated references. Verification and scoring
are read-only and never run LibreOffice or modify an agent's saved document.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

from score_extended import score_extended

ROOT = Path(__file__).resolve().parent
POLICY = "task-preserving-export-v1"


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def definitions():
    return json.loads((ROOT / "manifest.json").read_text())


def impress_tasks():
    return [task for task in definitions()["tasks"] if task.get("category") == "libreoffice_impress"]


def reference_names(task):
    expected = json.loads((ROOT / task["id"] / "upstream-task.json").read_text())["evaluator"]["expected"]
    expected = expected if isinstance(expected, list) else [expected]
    return list(dict.fromkeys(reference["dest"] for reference in expected))


def source_pins():
    paths = [ROOT / "manifest.json", *ROOT.rglob("*.py"), *ROOT.glob("*/upstream-task.json")]
    for task in definitions()["tasks"]:
        paths.extend(ROOT / task["id"] / asset["file"] for asset in task["assets"])
    pins = {str(path.relative_to(ROOT)): digest(path) for path in sorted(set(paths))}
    for task in definitions()["tasks"]:
        for asset in task["assets"]:
            if pins[f"{task['id']}/{asset['file']}"] != asset["sha256"]:
                raise ValueError("Original task asset differs from its pinned manifest hash")
    return pins


def confined(root, name):
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Scoring profile path escapes its root")
    return path


def verify(profile_path, office=None):
    profile_path = Path(profile_path).resolve()
    profile = json.loads(profile_path.read_text())
    if profile.get("schema") != 1 or profile.get("policy") != POLICY:
        raise ValueError("Unsupported scoring profile")
    if profile["sources"] != source_pins():
        raise ValueError("Scoring sources or original assets changed; prepare a new validated profile")
    expected_files = {f"{task['id']}/{name}" for task in impress_tasks() for name in reference_names(task)}
    if set(profile["references"]) != expected_files:
        raise ValueError("Scoring profile does not contain the complete Impress reference set")
    for name, sha in profile["references"].items():
        if digest(confined(profile_path.parent / "references", name)) != sha:
            raise ValueError(f"Frozen scoring reference changed: {name}")
    if office and digest(office) != profile["office"]["sha256"]:
        raise ValueError("LibreOffice exporter differs from the validated scoring profile")
    return {"name": POLICY, "sha256": digest(profile_path), "office": profile["office"],
            "references": profile["references"],
            "referenceCount": len(expected_files), "adaptedTaskIds": [task["id"] for task in impress_tasks()]}


def freeze(controls_root, output, office):
    controls_root, output = Path(controls_root).resolve(), Path(output).resolve()
    # Admission must not trust an old boolean receipt after artifacts change.
    # Regrade every actual saved specimen with the current code before freezing.
    office_identity = None
    evidence = {}
    references = {}
    originals = source_pins()
    for task in impress_tasks():
        directory = controls_root / task["id"]
        audit = json.loads((directory / "audit.json").read_text())
        controls = json.loads((directory / "controls.json").read_text())
        if audit.get("referencePolicy") != POLICY or controls.get("referencePolicy") != POLICY:
            raise ValueError("Controls were not evaluated under the requested reference policy")
        if not controls.get("cleanupVerified"):
            raise ValueError("Control exporter cleanup was not verified")
        if office_identity and office_identity != audit["office"]:
            raise ValueError("Control runs used different exporters")
        office_identity = audit["office"]
        if digest(office) != office_identity["sha256"]:
            raise ValueError("LibreOffice exporter differs from the control run")
        for receipt_path in directory.rglob("*.export.json"):
            receipt = json.loads(receipt_path.read_text())
            if not receipt.get("ownedProcessGroupExited") or not receipt.get("temporaryProfileRemoved"):
                raise ValueError("Control exporter cleanup was not verified")
            if digest(receipt["output"]) != receipt["outputSha256"] or digest(receipt["source"]) != receipt["sourceSha256"]:
                raise ValueError("Control source or exported artifact changed")
        paths = {"unchanged": directory / "unchanged-input" / task["inputFile"]}
        paths.update({kind: directory / kind / f"{kind}.pptx" for kind in
                      ["completed", "incorrect", "damaged-content", "damaged-format"]})
        for kind, path in paths.items():
            result = score_extended(task, path, reference_root=directory / "exported-references")
            if result.get("error") or result["taskSuccess"] != (kind == "completed"):
                raise ValueError(f"Grading control failed: {task['id']}/{kind}")
            if kind == "damaged-content" and result["contentMatches"]:
                raise ValueError("Text preservation control failed")
            if kind == "damaged-format" and not result["contentMatches"]:
                raise ValueError("Formatting control also changed text")
            evidence[f"{task['id']}/{kind}"] = {"sha256": digest(path), "score": result}
        for name in reference_names(task):
            references[f"{task['id']}/{name}"] = directory / "exported-references" / task["id"] / name
    output.mkdir(parents=True, exist_ok=False)
    for name, source in references.items():
        destination = output / "references" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    (output / "profile.json").write_text(json.dumps({
        "schema": 1, "policy": POLICY, "office": office_identity,
        "sources": originals, "references": {name: digest(path) for name, path in references.items()},
        "validation": evidence,
        "adaptation": "Export Impress references using the same LibreOffice build; derive duplicate-slide reference from preserved input plus final A,B copies. Other task categories retain raw scoring.",
    }, indent=2) + "\n")
    return verify(output / "profile.json", office)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    prepare = subcommands.add_parser("freeze")
    prepare.add_argument("--controls", type=Path, required=True)
    prepare.add_argument("--output", type=Path, required=True)
    prepare.add_argument("--libreoffice", type=Path, required=True)
    check = subcommands.add_parser("verify")
    check.add_argument("--profile", type=Path, required=True)
    check.add_argument("--libreoffice", type=Path, required=True)
    args = parser.parse_args()
    result = (freeze(args.controls, args.output, args.libreoffice) if args.command == "freeze"
              else verify(args.profile, args.libreoffice))
    print(json.dumps(result))
