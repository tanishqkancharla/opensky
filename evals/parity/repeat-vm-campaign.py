#!/usr/bin/env python3
"""Plan or run a bounded repeat of an immutable VM campaign.

The immutable stage remains the sole provider of desktop setup, reservations,
remote dispatch, collection, and settlement.  This tool owns only a new
campaign index and its pair-gate receipts under --output.
"""

from __future__ import annotations

import argparse
import shutil
import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterator


PINS = {
    "source": "c69d3b8533ffc860759707737e45dc5578466b23",
    "driverSource": "bd7c5a52253b20a8169d0a9a10437b8a14c68f6a",
    "driverSha256": "ba8b7c854f05f15be028ceee7ea0fbdf3266bd6f616309d5e78f0014c00c6e7d",
    "imageId": "sha256:7643bdb4ffdf5c661a0c88d357985cd884790f74272b993d26ed2e2703032b1f",
    "codeAndAssetsSha256": "05b25943c5c469782bcab4d8bfe4b64e04c04f998e63e100b45dead2590beca8",
    "scorerSha256": "985cb748fefedc3958bd1791288bfe51d83f0f7a700ddfae8fd941907b5b553b",
    "model": "gpt-5.6-terra",
    "reasoningEffort": "medium",
}
COUNTS = (2, 5, 20)
RUN_RE = re.compile(r"[a-z0-9-]{1,70}")


class ContractError(RuntimeError):
    """The immutable stage cannot safely supply this campaign."""


def now() -> str:
    return datetime.now(UTC).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ContractError(f"missing required stage evidence: {path}") from exc
    if not isinstance(value, dict):
        raise ContractError(f"required JSON object is not an object: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def require(value: bool, message: str) -> None:
    if not value:
        raise ContractError(message)


def under(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
    except ValueError:
        return False
    return True


def verify_files_manifest(stage: Path) -> str:
    manifest = stage / "files.sha256"
    require(manifest.is_file(), f"missing stage manifest: {manifest}")
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        try:
            expected, relative = line.split("  ", 1)
        except ValueError as exc:
            raise ContractError(f"invalid files.sha256 row: {line!r}") from exc
        path = (stage / relative).resolve()
        require(re.fullmatch(r"[a-f0-9]{64}", expected) is not None, f"invalid manifest SHA: {relative}")
        require(under(path, stage) and path.is_file(), f"unsafe or missing manifest path: {relative}")
        require(sha256(path) == expected, f"stage file hash changed: {relative}")
    return sha256(manifest)


def task_hash(tasks: list[dict[str, Any]]) -> str:
    stable = [
        {"name": task["name"], "taskId": task["taskId"], "order": task["order"], "fixture": task["fixture"]}
        for task in tasks
    ]
    return hashlib.sha256(json.dumps(stable, separators=(",", ":"), sort_keys=True).encode()).hexdigest()


def task_rows(selection: dict[str, Any]) -> list[dict[str, Any]]:
    tasks = selection.get("tasks")
    require(isinstance(tasks, list) and len(tasks) == 20, "selection must contain exactly 20 tasks")
    normalized: list[dict[str, Any]] = []
    task_ids: set[str] = set()
    names: set[str] = set()
    for task in tasks:
        require(isinstance(task, dict), "task row must be an object")
        name, task_id, order, fixture = task.get("name"), task.get("taskId"), task.get("order"), task.get("fixture")
        require(isinstance(name, str) and re.fullmatch(r"[a-z0-9-]+", name) is not None, f"invalid task name: {name!r}")
        require(isinstance(task_id, str) and re.fullmatch(r"[a-f0-9-]{36}", task_id) is not None, f"invalid task ID: {task_id!r}")
        require(order in (["opensky", "native"], ["native", "opensky"]), f"invalid backend order for {name}")
        require(isinstance(fixture, str) and fixture, f"missing fixture for {name}")
        require(task_id not in task_ids and name not in names, f"duplicate frozen task row: {name}/{task_id}")
        task_ids.add(task_id)
        names.add(name)
        normalized.append({"name": name, "taskId": task_id, "order": order, "fixture": fixture})
    return normalized


def gate_contract(stage: Path, task: dict[str, Any]) -> dict[str, Any]:
    gate_path = stage / f"{task['name']}-pair-gate.json"
    gate = read_json(gate_path)
    require(gate.get("accepted") is True, f"stage gate is not accepted: {task['name']}")
    require(gate.get("taskId") == task["taskId"], f"stage gate task mismatch: {task['name']}")
    for key in ("source", "imageId", "codeAndAssetsSha256", "model"):
        require(gate.get(key) == PINS[key], f"stage gate pin mismatch ({key}): {task['name']}")
    driver = gate.get("driver")
    require(isinstance(driver, dict), f"stage gate driver missing: {task['name']}")
    identity = driver.get("identity")
    require(driver.get("sha256") == PINS["driverSha256"] and isinstance(identity, dict) and identity.get("source") == PINS["driverSource"], f"stage gate driver mismatch: {task['name']}")
    runs = gate.get("runs")
    require(isinstance(runs, list) and {row.get("backend") for row in runs if isinstance(row, dict)} == {"opensky", "native"}, f"stage gate arms invalid: {task['name']}")
    invocation_hashes: dict[str, str] = {}
    for row in runs:
        require(isinstance(row, dict) and isinstance(row.get("run"), str) and row.get("backend") in {"opensky", "native"}, f"stage gate run invalid: {task['name']}")
        invocation_path = stage / "runs" / row["run"] / "artifacts" / "invocation.json"
        invocation = read_json(invocation_path)
        require(invocation.get("model") == PINS["model"], f"stage invocation model mismatch: {task['name']}/{row['backend']}")
        configuration = invocation.get("configuration")
        require(isinstance(configuration, dict) and configuration.get("model_reasoning_effort") == PINS["reasoningEffort"], f"stage invocation reasoning mismatch: {task['name']}/{row['backend']}")
        require(invocation.get("timeoutMs") is None and invocation.get("maxToolCalls") is None, f"stage invocation added task budget: {task['name']}/{row['backend']}")
        invocation_hashes[row["backend"]] = sha256(invocation_path)
    return {"gateSha256": sha256(gate_path), "invocationSha256": invocation_hashes}


def stage_contract(stage: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    require(stage.is_absolute() and stage.is_dir(), "--stage must name an existing absolute immutable stage directory")
    selection_path = stage / "full20-selection.json"
    selection = read_json(selection_path)
    require(selection.get("source") == PINS["source"], "selection SDK source pin mismatch")
    require(selection.get("driverSource") == PINS["driverSource"], "selection driver source pin mismatch")
    require(selection.get("driverSha256") == PINS["driverSha256"], "selection driver SHA pin mismatch")
    tasks = task_rows(selection)
    setup = read_json(stage / "setup-parent-review.json")
    preflight = read_json(stage / "code-host-preflight.json")
    preparation = read_json(stage / "preparation.json")
    require(setup.get("accepted") is True and setup.get("agentDispatched") is False, "stage setup receipt is not a pre-dispatch acceptance")
    for receipt, name in ((setup, "setup"), (preparation, "preparation")):
        require(receipt.get("source") == PINS["source"], f"{name} SDK source pin mismatch")
        require(receipt.get("driverSource") == PINS["driverSource"] and receipt.get("driverSha256") == PINS["driverSha256"], f"{name} driver pin mismatch")
    require(setup.get("imageId") == PINS["imageId"], "setup image pin mismatch")
    require(preflight.get("accepted") is True and preflight.get("imageId") == PINS["imageId"], "code-host preflight pin mismatch")
    require(preparation.get("profileSha256") == PINS["scorerSha256"], "scorer pin mismatch")
    launcher = stage / "run-arm-v3.sh"
    require(preflight.get("launcherSha256") == sha256(launcher), "launcher hash differs from code-host preflight")
    launcher_manifest = (stage / "arm-launcher-v3.sha256").read_text(encoding="utf-8").strip().split(maxsplit=1)
    require(len(launcher_manifest) == 2 and launcher_manifest[0] == sha256(launcher) and launcher_manifest[1] == "run-arm-v3.sh", "launcher manifest mismatch")
    files_hash = verify_files_manifest(stage)
    gate_hashes = {task["taskId"]: gate_contract(stage, task) for task in tasks}
    runners = {
        "arm": stage / "run-arm-recovered.py",
        "pair": stage / "review-pair-recovered.py",
    }
    for name, path in runners.items():
        require(path.is_file(), f"missing stage {name} runner")
    contract = {
        "stage": str(stage),
        "pins": PINS,
        "taskSetSha256": task_hash(tasks),
        "selectionSha256": sha256(selection_path),
        "filesManifestSha256": files_hash,
        "sourceBundleSha256": sha256(stage / "source.bundle"),
        "launcherSha256": sha256(launcher),
        "runnerSha256": {name: sha256(path) for name, path in runners.items()},
        "setupReceiptSha256": sha256(stage / "setup-parent-review.json"),
        "codeHostPreflightSha256": sha256(stage / "code-host-preflight.json"),
        "gateEvidenceByTask": gate_hashes,
    }
    return contract, tasks


def ledger_path(stage: Path) -> Path:
    return stage.parents[1] / "outputs" / "opensky" / "evals" / "runs" / "parity-budget.json"


def require_idle_provider(stage: Path) -> None:
    ledger = read_json(ledger_path(stage))
    entries = ledger.get("entries")
    require(isinstance(entries, list), "ledger entries missing")
    require(not any(isinstance(entry, dict) and entry.get("status") == "reserved" for entry in entries), "unsettled ledger reservation exists; reconcile it before dispatch")
    for run_dir in (stage / "runs").glob("*"):
        if not run_dir.is_dir() or not (run_dir / "dispatch.json").exists():
            continue
        require((run_dir / "completion.json").exists() and (run_dir / "budget-after.json").exists(), f"incomplete existing dispatch: {run_dir.name}")


@contextmanager
def controller_lock(stage: Path) -> Iterator[None]:
    name = "opensky-repeat-vm-" + hashlib.sha256(str(stage).encode()).hexdigest()[:20] + ".lock"
    lock_path = Path(tempfile.gettempdir()) / name
    with lock_path.open("w", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ContractError("another repeat VM controller holds the local exclusive lock") from exc
        handle.write(str(os.getpid()) + "\n")
        handle.flush()
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def run_name(campaign_id: str, ordinal: int, backend: str) -> str:
    value = f"repeat-{campaign_id}-{ordinal:02d}-{backend}"
    require(RUN_RE.fullmatch(value) is not None, f"unsafe generated run name: {value}")
    return value


def load_previous(previous: Path, expected_count: int, contract: dict[str, Any], tasks: list[dict[str, Any]], review_dir: Path) -> dict[str, Any]:
    result = read_json(previous / "stage-result.json")
    require(result.get("accepted") is True, "--previous is not an accepted completed repeat stage")
    require(result.get("count") == expected_count, f"--previous must be the accepted {expected_count}-task stage")
    require(result.get("stageContract") == contract, "--previous immutable stage contract differs")
    receipt = read_json(previous / "repeat-vm-campaign-receipt.json")
    require(receipt.get("stageContract") == contract and receipt.get("count") == expected_count, "--previous receipt does not bind the accepted stage")
    index = read_json(previous / "campaign-index.json")
    rows = validate_index(index, receipt, tasks, before_run=False)
    require(index.get("status") == "completed", "--previous index is not completed")
    gates = result.get("gates")
    require(isinstance(gates, list) and len(gates) == expected_count, "--previous accepted gate count mismatch")
    stage = Path(contract["stage"])
    reviewed: list[dict[str, Any]] = []
    for row in rows[:expected_count]:
        expected_gate = previous / "gates" / f"{row['name']}-pair-gate.json"
        require(expected_gate.is_file() and str(expected_gate) in gates, f"--previous gate missing or not retained: {row['name']}")
        retained_gate = read_json(expected_gate)
        require(retained_gate.get("accepted") is True and retained_gate.get("taskId") == row["taskId"], f"--previous retained gate invalid: {row['name']}")
        arms = {arm["backend"]: arm["run"] for arm in row["runs"]}
        validation = validate_completed_pair(stage, row, arms["opensky"], arms["native"], review_dir / f"{row['ordinal']:02d}-{row['name']}-pair-gate.json", review_dir / f"{row['ordinal']:02d}-{row['name']}-validation.json")
        reviewed.append({"taskId": row["taskId"], "gate": str(expected_gate), "gateSha256": sha256(expected_gate), "freshGateSha256": validation["gateSha256"], "freshValidation": str(review_dir / f"{row['ordinal']:02d}-{row['name']}-validation.json")})
    return {"previous": str(previous), "count": expected_count, "validatedAt": now(), "reviewedGates": reviewed}


def build_index(tasks: list[dict[str, Any]], count: int, campaign_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for ordinal, task in enumerate(tasks, start=1):
        selected = ordinal <= count
        runs = [
            {"backend": backend, "run": run_name(campaign_id, ordinal, backend), "state": "planned"}
            for backend in task["order"]
        ] if selected else []
        rows.append({"ordinal": ordinal, **task, "selected": selected, "state": "planned" if selected else "unrun", "runs": runs})
    return rows


def require_unique_provider_names(stage: Path, rows: list[dict[str, Any]]) -> None:
    existing = {path.name for path in (stage / "runs").iterdir() if path.is_dir()}
    planned = [arm["run"] for row in rows for arm in row["runs"]]
    require(len(planned) == len(set(planned)), "generated provider run names are not unique")
    collisions = sorted(set(planned) & existing)
    require(not collisions, f"provider run name already exists and cannot be retried: {', '.join(collisions)}")


def provider_for_task(stage: Path, task: dict[str, Any]) -> dict[str, Any]:
    """Select a frozen provider from the task's frozen fixture, never task name."""
    fixture = task["fixture"]
    if fixture == "office":
        runner = stage / "run-arm-recovered.py"
        launcher = stage / "run-arm-v3.sh"
        setup = read_json(stage / "setup-parent-review.json")
        preflight = read_json(stage / "code-host-preflight.json")
        require(setup.get("accepted") is True and setup.get("agentDispatched") is False, "office setup receipt is not pre-dispatch accepted")
        require(setup.get("source") == PINS["source"] and setup.get("imageId") == PINS["imageId"], "office setup pin mismatch")
        require(preflight.get("accepted") is True and preflight.get("imageId") == PINS["imageId"], "office preflight pin mismatch")
        require(preflight.get("launcherSha256") == sha256(launcher), "office launcher/preflight mismatch")
    elif fixture == "editor":
        runner = stage / "run-editor-arm-recovered.py"
        launcher = stage / "run-editor-arm-v1.sh"
        fixture_path = stage / "editor-fixture-v1.json"
        setup = read_json(stage / "editor-setup-parent-review.json")
        preflight = read_json(stage / "editor-code-host-preflight.json")
        editor_fixture = read_json(fixture_path)
        require(task["taskId"] in editor_fixture.get("taskIds", []), f"editor fixture does not admit {task['taskId']}")
        provenance = editor_fixture.get("sourceProvenance")
        require(isinstance(provenance, dict) and provenance.get("sdkCommit") == PINS["source"] and provenance.get("driverSource") == PINS["driverSource"] and provenance.get("driverSha256") == PINS["driverSha256"] and provenance.get("imageId") == PINS["imageId"] and provenance.get("profileSha256") == PINS["scorerSha256"] and provenance.get("codeAndAssetsSha256") == PINS["codeAndAssetsSha256"], "editor fixture pin mismatch")
        require(setup.get("accepted") is True and setup.get("agentDispatched") is False, "editor setup receipt is not pre-dispatch accepted")
        require(setup.get("source") == PINS["source"] and setup.get("imageId") == PINS["imageId"] and setup.get("editorFixtureSha256") == sha256(fixture_path), "editor setup pin mismatch")
        fingerprint = setup.get("editorFingerprint")
        require(fingerprint is not None and preflight.get("editorFingerprint") == fingerprint, "editor setup/preflight fingerprint mismatch")
        require(preflight.get("accepted") is True and preflight.get("imageId") == PINS["imageId"], "editor preflight pin mismatch")
        require(preflight.get("launcherSha256") == sha256(launcher), "editor launcher/preflight mismatch")
        require(provenance.get("codeModeHostSha256") == preflight.get("codeModeHostSha256"), "editor code-host pin mismatch")
    else:
        raise ContractError(f"unsupported frozen fixture provider: {fixture}")
    require(runner.is_file() and launcher.is_file(), f"missing frozen {fixture} provider")
    setup_path = stage / ("editor-setup-parent-review.json" if fixture == "editor" else "setup-parent-review.json")
    preflight_path = stage / ("editor-code-host-preflight.json" if fixture == "editor" else "code-host-preflight.json")
    return {"fixture": fixture, "armRunner": str(runner), "armRunnerSha256": sha256(runner), "launcher": str(launcher), "launcherSha256": sha256(launcher), "setupReceipt": str(setup_path), "setupReceiptSha256": sha256(setup_path), "preflightReceipt": str(preflight_path), "preflightReceiptSha256": sha256(preflight_path)}


def terminal_preagent_setup_failure(stage: Path, task: dict[str, Any], arm: dict[str, Any]) -> dict[str, Any]:
    """The only failure class which can receive a fresh replacement attempt."""
    run, backend = arm.get("run"), arm.get("backend")
    require(isinstance(run, str) and backend in {"opensky", "native"}, "failed arm identity is invalid")
    run_dir = stage / "runs" / run
    dispatch = read_json(run_dir / "dispatch.json")
    completion = read_json(run_dir / "completion.json")
    settlement = read_json(run_dir / "settlement.json")
    budget = read_json(run_dir / "budget-after.json")
    cleanup = read_json(run_dir / "artifacts" / "container-cleanup.json")
    remote_exit = read_json(run_dir / "remote-exit.json")
    require(dispatch.get("run") == run and dispatch.get("taskId") == task["taskId"] and dispatch.get("backend") == backend, f"failed dispatch identity mismatch: {run}")
    reservation = dispatch.get("reservationId")
    require(isinstance(reservation, str) and settlement.get("reservationId") == reservation and settlement.get("containerRemoved") is True, f"failed settlement mismatch: {run}")
    require(cleanup.get("reservationId") == reservation and cleanup.get("containerRemoved") is True and isinstance(cleanup.get("exitCode"), int) and cleanup["exitCode"] != 0 and remote_exit.get("exitCode") == cleanup.get("exitCode"), f"failed cleanup/remote-exit mismatch: {run}")
    entries = budget.get("entries")
    require(isinstance(entries, list) and any(isinstance(entry, dict) and entry.get("id") == reservation and entry.get("status") == "settled" for entry in entries), f"failed attempt is not settled: {run}")
    require(completion.get("run") == run and completion.get("taskId") == task["taskId"] and completion.get("backend") == backend and completion.get("terminal") is True, f"failed completion identity/terminal mismatch: {run}")
    # The legacy provider records no run-status object when setup aborts before
    # the agent process. `null` is therefore the expected explicit absence, not
    # an unknown post-agent outcome; require all score-bearing artifacts absent.
    require(completion.get("validEvaluation") in {False, None} and completion.get("score") is None and completion.get("remoteExitCode") == cleanup.get("exitCode") and not any((run_dir / "artifacts" / name).exists() for name in ("result.json", "score.json", "run-status.json")), f"failed arm is scored, unknown, or nonterminal: {run}")
    console = (run_dir / "remote-console.log").read_text(encoding="utf-8")
    marker = "Provide OPENSKY_EVAL_VSCODE for editor tasks"
    require(marker in console, f"failed arm is not the verified pre-agent editor setup failure: {run}")
    require(not any((run_dir / "artifacts" / name).exists() for name in ("invocation.json", "events.json", "events.jsonl", "transcript.json", "transcript.jsonl")), f"failed arm contains agent evidence: {run}")
    return {"run": run, "backend": backend, "reservationId": reservation, "completionSha256": sha256(run_dir / "completion.json"), "dispatchSha256": sha256(run_dir / "dispatch.json"), "settlementSha256": sha256(run_dir / "settlement.json"), "budgetAfterSha256": sha256(run_dir / "budget-after.json"), "failure": "terminal-pre-agent-editor-setup", "marker": marker}


def resume_attempt_name(stage: Path, old_run: str) -> str:
    # A new directory is required: original evidence and its receipt stay immutable.
    suffix = hashlib.sha256((str(stage) + old_run).encode()).hexdigest()[:12]
    candidate = f"{old_run}-resume-{suffix}"
    require(RUN_RE.fullmatch(candidate) is not None and not (stage / "runs" / candidate).exists(), f"replacement provider run already exists: {candidate}")
    return candidate


def validate_retained_completed_pair(stage: Path, task: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    """Read-only predecessor validation for an interrupted campaign."""
    arms = {arm.get("backend"): arm for arm in row.get("runs", []) if isinstance(arm, dict)}
    require(set(arms) == {"opensky", "native"}, f"completed row arms invalid: {task['name']}")
    gate_path = Path(row.get("gate", ""))
    validation_path = Path(row.get("validation", ""))
    require(gate_path.is_file() and validation_path.is_file(), f"completed row evidence missing: {task['name']}")
    gate = read_json(gate_path)
    validation = read_json(validation_path)
    require(gate.get("accepted") is True and gate.get("taskId") == task["taskId"], f"retained gate invalid: {task['name']}")
    require(validation.get("accepted") is True and validation.get("taskId") == task["taskId"] and validation.get("gateSha256") == sha256(gate_path) and validation.get("pins") == PINS, f"retained validation/pin mismatch: {task['name']}")
    code_host_sha = read_json(stage / "code-host-preflight.json").get("codeModeHostSha256")
    require(isinstance(code_host_sha, str), "missing office code-host pin")
    raw = [validate_raw_arm(stage, task, arms[backend]["run"], backend, code_host_sha) for backend in ("opensky", "native")]
    return {"taskId": task["taskId"], "gate": str(gate_path), "gateSha256": sha256(gate_path), "validation": str(validation_path), "validationSha256": sha256(validation_path), "arms": raw}


def resume_plan(stage: Path, output: Path) -> dict[str, Any]:
    """Read-only admission check for a halted count-20 campaign."""
    receipt = read_json(output / "repeat-vm-campaign-receipt.json")
    index = read_json(output / "campaign-index.json")
    require(receipt.get("count") == 20 and index.get("count") == 20 and index.get("status") == "incomplete", "--resume requires an incomplete count-20 campaign")
    require(receipt.get("stageContract") == index.get("stageContract") and receipt.get("stageContract", {}).get("stage") == str(stage), "resume campaign/stage receipt mismatch")
    current_contract, tasks = stage_contract(stage)
    require(receipt.get("stageContract") == current_contract, "resume frozen stage contract changed")
    rows = index.get("tasks")
    require(isinstance(rows, list) and len(rows) == 20, "resume index must retain all 20 rows")
    completed: list[dict[str, Any]] = []
    failing: tuple[dict[str, Any], dict[str, Any]] | None = None
    for task, row in zip(tasks, rows):
        require(isinstance(row, dict) and all(row.get(key) == task[key] for key in ("name", "taskId", "order", "fixture")) and row.get("selected") is True, f"resume index task mismatch: {task['name']}")
        if row.get("state") == "completed":
            require(failing is None, "completed rows after an interrupted row are unsafe")
            completed.append(validate_retained_completed_pair(stage, task, row))
            continue
        if failing is None:
            require(row.get("state") == "incomplete", f"first unfinished row must retain terminal failure: {task['name']}")
            arm_rows = [arm for arm in row.get("runs", []) if isinstance(arm, dict) and (stage / "runs" / str(arm.get("run"))).is_dir()]
            require(len(arm_rows) == 1, f"interrupted row must retain exactly one existing attempt: {task['name']}")
            failure = terminal_preagent_setup_failure(stage, task, arm_rows[0])
            provider = provider_for_task(stage, task)
            failing = (task, {"ordinal": row.get("ordinal"), "failedAttempt": failure, "replacementRun": resume_attempt_name(stage, failure["run"]), "provider": provider, "originalRow": row})
        else:
            require(row.get("state") == "planned" and row.get("gate") is None and row.get("validation") is None, f"unrun row mutated after interruption: {task['name']}")
    require(failing is not None, "resume campaign has no verified retryable terminal pre-agent failure")
    providers = {task["fixture"]: provider_for_task(stage, task) for task in tasks}
    return {"providers": providers, "ready": True, "mode": "resume-plan-only", "campaign": str(output), "retainedCompletedPairs": completed, "replacement": failing[1], "negativeInvariants": {"originalReceiptUnchanged": sha256(output / "repeat-vm-campaign-receipt.json"), "originalIndexUnchanged": sha256(output / "campaign-index.json"), "onlyTerminalPreAgentFailureIsRetryable": True, "noScoredUnknownOrLiveAttemptAdmitted": True, "visibleRows": 20}}


def verify_receipt(output: Path, stage: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    receipt = read_json(output / "repeat-vm-campaign-receipt.json")
    current, tasks = stage_contract(stage)
    require(receipt.get("stageContract") == current, "stage, runner, launcher, source, or task-set contract changed after planning")
    return receipt, tasks


def completion_summary(stage: Path, run: str, task: dict[str, Any], backend: str) -> dict[str, Any]:
    completion = read_json(stage / "runs" / run / "completion.json")
    require(completion.get("run") == run and completion.get("taskId") == task["taskId"] and completion.get("backend") == backend, f"provider completion identity mismatch: {run}")
    require(completion.get("terminal") is True and completion.get("validEvaluation") is True and completion.get("remoteExitCode") == 0, f"provider completion is not terminal/valid: {run}")
    require(completion.get("source") == PINS["source"], f"provider source mismatch: {run}")
    return {"state": "completed", "completion": str((stage / "runs" / run / "completion.json")), "taskSuccess": completion.get("score", {}).get("taskSuccess"), "toolCalls": completion.get("toolCalls"), "elapsedMs": completion.get("elapsedMs")}


def same_usage(left: Any, right: Any) -> bool:
    return isinstance(left, dict) and isinstance(right, dict) and left == right


def validate_raw_arm(stage: Path, task: dict[str, Any], run: str, backend: str, code_host_sha: str) -> dict[str, Any]:
    run_dir = stage / "runs" / run
    artifacts = run_dir / "artifacts"
    completion = read_json(run_dir / "completion.json")
    invocation = read_json(artifacts / "invocation.json")
    environment = read_json(artifacts / "environment.json")
    score = read_json(artifacts / "score.json")
    result = read_json(artifacts / "result.json")
    status = read_json(artifacts / "run-status.json")
    cleanup = read_json(artifacts / "container-cleanup.json")
    budget = read_json(run_dir / "budget-after.json")
    require(completion.get("run") == run and completion.get("backend") == backend and completion.get("taskId") == task["taskId"], f"completion identity mismatch: {run}")
    require(completion.get("terminal") is True and completion.get("validEvaluation") is True and completion.get("remoteExitCode") == 0 and completion.get("infrastructureError") is None, f"completion is not valid terminal evidence: {run}")
    require(completion.get("source") == PINS["source"] and completion.get("imageId") == PINS["imageId"], f"completion source/image mismatch: {run}")
    runtime = completion.get("runtime")
    require(isinstance(runtime, dict) and runtime.get("codeModeHostSha256") == code_host_sha, f"completion code-host mismatch: {run}")
    require(invocation.get("model") == PINS["model"] and invocation.get("timeoutMs") is None and invocation.get("maxToolCalls") is None, f"invocation model/budget mismatch: {run}")
    configuration = invocation.get("configuration")
    require(isinstance(configuration, dict) and configuration.get("model_reasoning_effort") == PINS["reasoningEffort"], f"invocation reasoning mismatch: {run}")
    require(environment.get("sdkCommit") == PINS["source"] and environment.get("codeAndAssetsSha256") == PINS["codeAndAssetsSha256"], f"environment SDK/assets mismatch: {run}")
    driver = environment.get("driver")
    scorer = environment.get("scoringProfile")
    require(isinstance(driver, dict) and driver.get("sha256") == PINS["driverSha256"] and isinstance(driver.get("identity"), dict) and driver["identity"].get("source") == PINS["driverSource"], f"environment driver mismatch: {run}")
    require(isinstance(scorer, dict) and scorer.get("sha256") == PINS["scorerSha256"], f"environment scorer mismatch: {run}")
    require(score.get("backend") == backend and score.get("taskId") == task["taskId"] and score.get("infrastructureError") is None, f"score identity/infrastructure mismatch: {run}")
    require(isinstance(score.get("scoringProfile"), dict) and score["scoringProfile"].get("sha256") == PINS["scorerSha256"], f"score scorer mismatch: {run}")
    require(status.get("taskId") == task["taskId"] and status.get("backend") == backend and status.get("validEvaluation") is True and status.get("temporaryRemoved") is True and status.get("infrastructureError") is None, f"run-status mismatch: {run}")
    reservation = completion.get("reservationId")
    require(isinstance(reservation, str) and reservation == invocation.get("preReservedId") == cleanup.get("reservationId"), f"reservation mismatch: {run}")
    require(cleanup.get("containerRemoved") is True, f"cleanup mismatch: {run}")
    require(score.get("outcome") == completion.get("score") and result.get("infrastructureError") is None, f"result/score mismatch: {run}")
    require(completion.get("toolCalls") == score.get("toolCalls") == result.get("toolCalls") and completion.get("elapsedMs") == score.get("elapsedMs"), f"calls/time mismatch: {run}")
    result_usage = result.get("usage")
    require(isinstance(result_usage, dict) and same_usage(result_usage, score.get("usage")), f"result/score usage mismatch: {run}")
    entries = budget.get("entries")
    require(isinstance(entries, list), f"budget entries missing: {run}")
    matches = [entry for entry in entries if isinstance(entry, dict) and entry.get("id") == reservation]
    require(len(matches) == 1 and matches[0].get("status") == "settled" and same_usage(matches[0].get("usage"), result_usage.get("total")), f"settled usage mismatch: {run}")
    result_path = artifacts / "result.json"
    require(completion.get("resultSha256") == sha256(result_path), f"result hash mismatch: {run}")
    return {"run": run, "backend": backend, "taskSuccess": score["outcome"].get("taskSuccess"), "toolCalls": score.get("toolCalls"), "elapsedMs": score.get("elapsedMs"), "completionSha256": sha256(run_dir / "completion.json"), "resultSha256": sha256(result_path), "scoreSha256": sha256(artifacts / "score.json")}


def validate_completed_pair(stage: Path, task: dict[str, Any], opensky_run: str, native_run: str, gate_path: Path, validation_path: Path) -> dict[str, Any]:
    require(not gate_path.exists() and not validation_path.exists(), f"pair review output already exists: {task['name']}")
    pair_log = validation_path.with_suffix(".review.log")
    with pair_log.open("w", encoding="utf-8") as log:
        result = subprocess.run([sys.executable, str(stage / "review-pair-recovered.py"), task["taskId"], opensky_run, native_run, str(gate_path)], cwd=stage, stdout=log, stderr=subprocess.STDOUT)
    require(result.returncode == 0, f"existing pair verifier rejected {task['name']}; see {pair_log}")
    gate = read_json(gate_path)
    require(gate.get("accepted") is True and gate.get("taskId") == task["taskId"], f"pair gate identity mismatch: {task['name']}")
    code_host_sha = read_json(stage / "code-host-preflight.json").get("codeModeHostSha256")
    require(isinstance(code_host_sha, str), "missing code-host pin")
    arms = [validate_raw_arm(stage, task, opensky_run, "opensky", code_host_sha), validate_raw_arm(stage, task, native_run, "native", code_host_sha)]
    validation = {"accepted": True, "validatedAt": now(), "taskId": task["taskId"], "gate": str(gate_path), "gateSha256": sha256(gate_path), "arms": arms, "pins": PINS}
    write_json(validation_path, validation)
    return validation


def validate_index(index: dict[str, Any], receipt: dict[str, Any], tasks: list[dict[str, Any]], *, before_run: bool) -> list[dict[str, Any]]:
    require(index.get("campaignId") == receipt.get("campaignId") and index.get("count") == receipt.get("count") and index.get("stageContract") == receipt.get("stageContract"), "campaign index receipt binding mismatch")
    rows = index.get("tasks")
    require(isinstance(rows, list) and len(rows) == 20, "campaign index must retain exactly 20 rows")
    expected = build_index(tasks, receipt["count"], receipt["campaignId"])
    for actual, baseline in zip(rows, expected):
        for key in ("ordinal", "name", "taskId", "order", "fixture", "selected"):
            require(actual.get(key) == baseline.get(key), f"campaign index {key} mismatch for row {baseline['ordinal']}")
        require(actual.get("runs") == baseline.get("runs") or (not before_run and actual.get("runs") and [{"backend": arm.get("backend"), "run": arm.get("run")} for arm in actual["runs"]] == [{"backend": arm["backend"], "run": arm["run"]} for arm in baseline["runs"]]), f"campaign index run names mismatch for row {baseline['ordinal']}")
        if before_run:
            require(actual.get("state") == baseline.get("state"), f"campaign index state is not fresh for row {baseline['ordinal']}")
        elif baseline["selected"]:
            require(actual.get("state") == "completed" and isinstance(actual.get("gate"), str) and isinstance(actual.get("validation"), str), f"accepted previous row is incomplete: {baseline['ordinal']}")
        else:
            require(actual.get("state") == "unrun" and actual.get("runs") == [], f"unselected previous row changed: {baseline['ordinal']}")
    require(sum(row.get("selected") is True for row in rows) == receipt["count"], "campaign index selected count mismatch")
    return rows

def execute(output: Path, stage: Path, count: int, *, resume: bool = False) -> None:
    with controller_lock(stage):
        require_idle_provider(stage)
        if resume:
            admission = resume_plan(stage, output)
            index_path = output / "campaign-index.json"
            index = read_json(index_path)
            tasks = task_rows(read_json(stage / "full20-selection.json"))
            replacement = admission["replacement"]
            ordinal = replacement["ordinal"]
            require(isinstance(ordinal, int) and 1 <= ordinal <= 20, "resume replacement ordinal invalid")
            history_dir = output / "attempt-history" / replacement["failedAttempt"]["run"]
            require(not history_dir.exists(), "resume history already exists; do not replay a resume mutation")
            history_dir.mkdir(parents=True)
            shutil.copy2(index_path, history_dir / "campaign-index-before-resume.json")
            old_run = replacement["failedAttempt"]["run"]
            for suffix in (".json", ".log"):
                source = output / "arms" / f"{tasks[ordinal - 1]['taskId']}-{replacement['failedAttempt']['backend']}{suffix}"
                if source.exists():
                    shutil.copy2(source, history_dir / source.name)
            row = index["tasks"][ordinal - 1]
            arm = next(item for item in row["runs"] if item["backend"] == replacement["failedAttempt"]["backend"])
            row.setdefault("attemptHistory", []).append({"backend": arm["backend"], "run": old_run, "reason": replacement["failedAttempt"]["failure"], "state": "not-scored", "failedAttempt": replacement["failedAttempt"]})
            arm["run"] = replacement["replacementRun"]
            arm["state"] = "planned"
            row["state"] = "planned"
            row["gate"] = None
            row["validation"] = None
            index["status"] = "planned"
            index["resumeAdmission"] = {"at": now(), "replacement": replacement, "history": str(history_dir), "providers": admission["providers"]}
            write_json(index_path, index)
        else:
            receipt, tasks = verify_receipt(output, stage)
            index_path = output / "campaign-index.json"
            index = read_json(index_path)
            rows = validate_index(index, receipt, tasks, before_run=True)
        if resume:
            receipt = read_json(output / "repeat-vm-campaign-receipt.json")
            rows = index["tasks"]
        require_idle_provider(stage)
        # Re-check the immutable receipt and idle evidence under the local lock.
        verify_receipt(output, stage)
        require_idle_provider(stage)
        index["status"] = "running"
        index.setdefault("startedAt", now())
        write_json(index_path, index)
        for row, task in zip(rows, tasks):
            if not row.get("selected"):
                continue
            if row.get("state") == "completed":
                continue
            for arm in row["runs"]:
                run, backend = arm["run"], arm["backend"]
                arm_path = output / "arms" / f"{task['taskId']}-{backend}.json"
                log_path = output / "arms" / f"{task['taskId']}-{backend}.log"
                try:
                    require((stage / "runs" / run).exists() is False, f"existing provider run cannot be retried: {run}")
                    provider_contract = provider_for_task(stage, task)
                    pinned_providers = (index.get("resumeAdmission") or {}).get("providers") or receipt.get("provider", {}).get("armsByFixture")
                    require(isinstance(pinned_providers, dict) and pinned_providers.get(task["fixture"]) == provider_contract, "fixture provider changed after admission")
                    write_json(arm_path, {"run": run, "backend": backend, "taskId": task["taskId"], "stage": str(stage), "state": "dispatching", "log": str(log_path), "receipt": receipt["campaignId"]})
                    verify_receipt(output, stage)
                    with log_path.open("w", encoding="utf-8") as log:
                        provider = subprocess.run([sys.executable, provider_contract["armRunner"], run, backend, "--task", task["taskId"]], cwd=stage, stdout=log, stderr=subprocess.STDOUT)
                    require(provider.returncode == 0, f"stage provider failed for {run}; retained log: {log_path}")
                    summary = completion_summary(stage, run, task, backend)
                except Exception as exc:
                    write_json(arm_path, {"run": run, "backend": backend, "taskId": task["taskId"], "stage": str(stage), "state": "incomplete", "error": str(exc), "log": str(log_path), "receipt": receipt["campaignId"]})
                    row["state"] = "incomplete"
                    index["status"] = "incomplete"
                    write_json(index_path, index)
                    raise
                arm.update(summary)
                write_json(arm_path, {"run": run, "backend": backend, "taskId": task["taskId"], "stage": str(stage), "log": str(log_path), "receipt": receipt["campaignId"], **summary})
                write_json(index_path, index)
                print(json.dumps({"completedRun": run, "backend": backend, "taskSuccess": summary["taskSuccess"], "toolCalls": summary["toolCalls"], "elapsedMs": summary["elapsedMs"]}), flush=True)
            gate_path = output / "gates" / f"{task['name']}-pair-gate.json"
            try:
                arm_names = {arm["backend"]: arm["run"] for arm in row["runs"]}
                validation = validate_completed_pair(stage, task, arm_names["opensky"], arm_names["native"], gate_path, output / "pair-validations" / f"{task['name']}.json")
            except Exception:
                row["state"] = "incomplete"
                index["status"] = "incomplete"
                write_json(index_path, index)
                raise
            row["state"] = "completed"
            row["gate"] = str(gate_path)
            row["validation"] = str(output / "pair-validations" / f"{task['name']}.json")
            write_json(index_path, index)
        index["status"] = "completed"
        index["completedAt"] = now()
        write_json(index_path, index)
        write_json(output / "stage-result.json", {"accepted": True, "completedAt": now(), "count": count, "campaignId": receipt["campaignId"], "stageContract": receipt["stageContract"], "index": str(index_path), "gates": [row.get("gate") for row in rows if row.get("selected")], "validations": [row.get("validation") for row in rows if row.get("selected")]})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True, type=Path, help="absolute immutable stage directory")
    parser.add_argument("--output", type=Path, help="new campaign index directory")
    parser.add_argument("--count", type=int, choices=COUNTS)
    parser.add_argument("--previous", type=Path, help="accepted preceding repeat stage (required for 5/20)")
    parser.add_argument("--run", action="store_true", help="dispatch through the stage's existing serialized provider")
    parser.add_argument("--resume", type=Path, help="inspect an existing incomplete count-20 campaign; --run dispatches only after admission")
    args = parser.parse_args()
    require(args.stage.is_absolute(), "--stage must be absolute")
    stage = args.stage.resolve()
    if args.resume is not None:
        require(args.output is None and args.count is None and args.previous is None, "--resume cannot be combined with --output, --count, or --previous")
        require(args.resume.is_absolute(), "--resume must name an existing absolute campaign directory")
        plan = resume_plan(stage, args.resume.resolve())
        if args.run:
            execute(args.resume.resolve(), stage, 20, resume=True)
            print(json.dumps({"ready": True, "mode": "resume-run", "campaign": str(args.resume.resolve())}))
            return 0
        print(json.dumps(plan, indent=2, sort_keys=True))
        return 0
    require(args.output is not None and args.count is not None, "--output and --count are required unless --resume is used")
    output = args.output.resolve()
    require(not output.exists(), "--output must be a new directory")
    require(not under(output, stage), "--output must not be inside the immutable stage")
    if args.count == 2:
        require(args.previous is None, "--previous is only valid for count 5 or 20")
    else:
        require(args.previous is not None, "--previous accepted stage is required for count 5 or 20")
    contract, tasks = stage_contract(stage)
    campaign_id = hashlib.sha256((str(output) + contract["taskSetSha256"]).encode()).hexdigest()[:20]
    rows = build_index(tasks, args.count, campaign_id)
    require_unique_provider_names(stage, rows)
    # Verify each selected fixture provider before any campaign receipt exists;
    # this catches a missing editor setup/pin in plan-only mode as well.
    providers = {task["fixture"]: provider_for_task(stage, task) for task in tasks[:args.count]}
    output.mkdir(parents=True)
    (output / "arms").mkdir()
    (output / "gates").mkdir()
    (output / "pair-validations").mkdir()
    previous_validation = None
    if args.count > 2:
        previous = args.previous.resolve()
        review_dir = output / "previous-review"
        review_dir.mkdir()
        previous_validation = load_previous(previous, 2 if args.count == 5 else 5, contract, tasks, review_dir)
    receipt = {"createdAt": now(), "campaignId": campaign_id, "count": args.count, "mode": "run" if args.run else "plan-only", "stageContract": contract, "previous": str(args.previous.resolve()) if args.previous else None, "previousValidation": previous_validation, "provider": {"armsByFixture": providers, "pairVerifier": str(stage / "review-pair-recovered.py"), "remoteContract": "immutable stage provider; its worker lock remains authoritative"}}
    write_json(output / "repeat-vm-campaign-receipt.json", receipt)
    index = {"campaignId": campaign_id, "count": args.count, "stage": str(stage), "stageContract": contract, "tasks": rows, "status": "planned"}
    write_json(output / "campaign-index.json", index)
    if not args.run:
        print(json.dumps({"ready": True, "mode": "plan-only", "campaignId": campaign_id, "selectedTasks": args.count, "visibleRows": 20, "output": str(output)}))
        return 0
    execute(output, stage, args.count)
    print(json.dumps({"ready": True, "mode": "run", "campaignId": campaign_id, "selectedTasks": args.count, "visibleRows": 20, "output": str(output)}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractError as exc:
        print(f"repeat-vm-campaign: {exc}", file=sys.stderr)
        raise SystemExit(2)
