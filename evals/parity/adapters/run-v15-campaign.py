#!/usr/bin/env python3
"""Admit V15 through the immutable V14 repeat controller.

This adapter changes only V15 admission.  The imported controller still owns
the 2 -> 5 -> 20 progression, run naming, lock, dispatch, collection, pair
validation, and settlement.  It refuses both planning and execution until the
two Linux release receipts and the fresh immutable-stage contract agree.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CONTROLLER_PATH = ROOT / "opensky-delivery/evals/parity/repeat-vm-campaign.py"
CONTROLLER_SHA256 = "9a8e36b6e2d899242a9ee88ebd52420e74190749877bb8cd181611fe31241838"
STAGE = (ROOT / "vm-agent-unicode-v15").resolve()
V14_STAGE = (ROOT / "vm-agent-popup-click-v5").resolve()
SDK_GATE = ROOT / "linux-unicode-release/sdk-acceptance.json"
LINUX_GATE = ROOT / "linux-unicode-release/linux-canonical-acceptance.json"
SOURCE_BUNDLE_SHA256 = "ab3ecdca6b148c77a7aca2a0a23e8f7c6aa384b7e5d78136b5b78bc4f664de03"
PINS = {
    "source": "c69d3b8533ffc860759707737e45dc5578466b23",
    "driverSource": "cfe578ba53afce435486694bcb0048e81f2d9a34",
    "driverSha256": "a0bb400f185094e292507b642c77714ded1361b45c181526385c3fa59a00500a",
    "imageId": "sha256:7643bdb4ffdf5c661a0c88d357985cd884790f74272b993d26ed2e2703032b1f",
    "codeAndAssetsSha256": "05b25943c5c469782bcab4d8bfe4b64e04c04f998e63e100b45dead2590beca8",
    "scorerSha256": "985cb748fefedc3958bd1791288bfe51d83f0f7a700ddfae8fd941907b5b553b",
    "model": "gpt-5.6-terra",
    "reasoningEffort": "medium",
}


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


if digest(CONTROLLER_PATH) != CONTROLLER_SHA256:
    raise RuntimeError("V15 adapter refuses an unpinned parent controller")
spec = importlib.util.spec_from_file_location("v14_repeat_controller", CONTROLLER_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("cannot import the pinned V14 repeat controller")
controller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)
controller.PINS = PINS


def require(value: bool, message: str) -> None:
    if not value:
        raise controller.ContractError(message)


def receipt(path: Path) -> dict[str, Any]:
    return controller.read_json(path)


def require_release_gates() -> dict[str, Any]:
    sdk, linux = receipt(SDK_GATE), receipt(LINUX_GATE)
    require(sdk.get("status") == "accepted SDK candidate behavior across baseline plus focused configuration repair", "SDK candidate receipt is not accepted")
    require(sdk.get("driverSource") == PINS["driverSource"] and sdk.get("releaseBinarySha256") == PINS["driverSha256"], "SDK candidate driver pin mismatch")
    require(sdk.get("passedChecks") == 33 and sdk.get("focusedSkippedChecks") == 24, "SDK candidate receipt does not retain the accepted 33-check evidence")
    require(set(sdk.get("runs", [])) == {34818732007, 34820063198}, "SDK candidate receipt run set mismatch")
    require(sdk.get("changesBetweenRuns") == [".github/workflows/linux-typing.yml"], "SDK candidate correction was not workflow-only")
    require(linux.get("accepted") is True, "Linux canonical receipt is not accepted")
    require(linux.get("source") == PINS["driverSource"] and linux.get("run") == 34817566624, "Linux canonical driver source/run mismatch")
    require(linux.get("desktopCases") == 129 and linux.get("lanes") == {"opensky-desktop-ubuntu-24.04-shared": 83, "opensky-desktop-ubuntu-24.04-native": 39, "opensky-desktop-ubuntu-24.04-capture": 7}, "Linux canonical receipt must retain all 129 Linux desktop cases")
    return {
        "sdkCandidate": {"path": str(SDK_GATE), "sha256": digest(SDK_GATE), "passedChecks": 33, "runs": [34818732007, 34820063198]},
        "linuxCanonical": {"path": str(LINUX_GATE), "sha256": digest(LINUX_GATE), "linuxDesktopCases": 129},
    }


def strict_v15_stage_contract(stage: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    require(stage.resolve() == STAGE, f"V15 adapter only admits its fixed stage: {STAGE}")
    require(stage.is_dir(), "V15 immutable stage is missing")
    gates = require_release_gates()
    selection_path = stage / "full20-selection.json"
    selection = receipt(selection_path)
    for key in ("source", "driverSource", "driverSha256"):
        require(selection.get(key) == PINS[key], f"V15 full20 selection pin mismatch ({key})")
    tasks = controller.task_rows(selection)
    v14_tasks = controller.task_rows(receipt(V14_STAGE / "full20-selection.json"))
    require(tasks == v14_tasks, "V15 task rows differ from frozen V14 full20 rows")

    setup = receipt(stage / "setup-parent-review.json")
    preflight = receipt(stage / "code-host-preflight.json")
    preparation = receipt(stage / "preparation.json")
    require(setup.get("accepted") is True and setup.get("agentDispatched") is False, "V15 setup receipt is not accepted pre-dispatch evidence")
    for value, name in ((setup, "setup"), (preparation, "preparation")):
        for key in ("source", "driverSource", "driverSha256", "imageId"):
            require(value.get(key) == PINS[key], f"V15 {name} pin mismatch ({key})")
    require(preflight.get("accepted") is True and preflight.get("imageId") == PINS["imageId"], "V15 code-host preflight is not accepted for the pinned image")
    require(preparation.get("profileSha256") == PINS["scorerSha256"], "V15 scorer pin mismatch")
    require(preparation.get("codeAndAssetsSha256") == PINS["codeAndAssetsSha256"], "V15 code/assets pin mismatch")
    require(preparation.get("model") == PINS["model"] and preparation.get("reasoningEffort") == PINS["reasoningEffort"], "V15 model pin mismatch")
    require(preparation.get("sourceBundleSha256") == SOURCE_BUNDLE_SHA256, "V15 preparation source bundle mismatch")

    launcher = stage / "run-arm-v3.sh"
    require(launcher.is_file() and preflight.get("launcherSha256") == digest(launcher), "V15 office launcher/preflight hash mismatch")
    manifest = (stage / "arm-launcher-v3.sha256").read_text(encoding="utf-8").strip().split(maxsplit=1)
    require(len(manifest) == 2 and manifest[0] == digest(launcher) and manifest[1] == "run-arm-v3.sh", "V15 office launcher manifest mismatch")
    require(digest(stage / "source.bundle") == SOURCE_BUNDLE_SHA256, "V15 source bundle mismatch")
    files_manifest = controller.verify_files_manifest(stage)
    runners = {"arm": stage / "run-arm-recovered.py", "pair": stage / "review-pair-recovered.py"}
    for name, path in runners.items():
        require(path.is_file(), f"missing V15 {name} runner")
    return {
        "stage": str(stage), "pins": PINS, "taskSetSha256": controller.task_hash(tasks),
        "selectionSha256": digest(selection_path), "filesManifestSha256": files_manifest,
        "sourceBundleSha256": SOURCE_BUNDLE_SHA256, "launcherSha256": digest(launcher),
        "runnerSha256": {name: digest(path) for name, path in runners.items()},
        "setupReceiptSha256": digest(stage / "setup-parent-review.json"),
        "codeHostPreflightSha256": digest(stage / "code-host-preflight.json"),
        "releaseGates": gates, "adapterSha256": digest(Path(__file__).resolve()),
        "parentControllerSha256": CONTROLLER_SHA256,
    }, tasks


controller.stage_contract = strict_v15_stage_contract

if __name__ == "__main__":
    try:
        raise SystemExit(controller.main())
    except controller.ContractError as exc:
        print(f"run-v15-campaign: {exc}", file=sys.stderr)
        raise SystemExit(2)
