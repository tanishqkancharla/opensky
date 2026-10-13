#!/usr/bin/env python3
"""Opt-in Linux sandbox readiness; no policy changes, driver or desktop input."""
import argparse, json, os, pathlib, signal, subprocess, tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=pathlib.Path, required=True)
parser.add_argument("--require-ready", action="store_true")
args = parser.parse_args()
out = args.output.resolve(); out.mkdir(parents=True, exist_ok=True)
if os.geteuid() == 0:
    raise SystemExit("Sandbox readiness must run as the desktop's ordinary user")

def read(path):
    try: return pathlib.Path(path).read_text().strip()
    except OSError as error: return {"unavailable": str(error)}

status = read("/proc/self/status")
evidence = {"uid": os.getuid(), "gid": os.getgid(), "sdkSource": os.environ.get("GITHUB_SHA"),
    "node": subprocess.check_output(["node", "--version"], text=True).strip(),
    "chrome": subprocess.check_output(["google-chrome-stable", "--version"], text=True).strip(),
    "kernel": os.uname().release, "processStatus": status,
    "lsmProfile": read("/proc/self/attr/current"),
    "kernelSettings": {key: read("/proc/sys/" + key) for key in [
        "kernel/unprivileged_userns_clone", "kernel/apparmor_restrict_unprivileged_userns",
        "user/max_user_namespaces"]}, "namespaceChecks": [],
    "policyChanged": False, "desktopGUIVerified": False}
probe = out / "namespace-probe"
subprocess.run(["clang", "-Wall", "-Wextra", "-Werror", str(pathlib.Path(__file__).with_name("namespace-probe.c")), "-o", str(probe)], check=True, timeout=30)
for operation in ["clone-user", "clone-user-pid-net", "unshare-user", "unshare-user-pid-net"]:
    result = subprocess.run([str(probe), operation], capture_output=True, text=True, timeout=5)
    if result.returncode not in (0, 1): raise RuntimeError("Namespace probe failed: " + result.stderr)
    item = json.loads(result.stdout); item["exitCode"] = result.returncode
    evidence["namespaceChecks"].append(item)
with tempfile.TemporaryDirectory(prefix="chrome-sandbox-", dir=out) as profile:
    argv = ["google-chrome-stable", "--headless", "--disable-gpu", "--no-first-run",
        "--user-data-dir=" + profile, "--dump-dom", "chrome://sandbox"]
    evidence["chromeArgv"] = argv
    process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    timed_out = False
    try: stdout, stderr = process.communicate(timeout=15)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try: stdout, stderr = process.communicate(timeout=2)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL); stdout, stderr = process.communicate(timeout=2)
    finally:
        # Chrome can leave descendants after its leader exits. Only this probe's
        # newly created process group is owned here; no shared Chrome is touched.
        try: os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError: pass
    (out / "chrome-sandbox.html").write_bytes(stdout)
    (out / "chrome-sandbox.stderr.log").write_bytes(stderr)
    evidence["chromeExitCode"] = process.returncode
    evidence["chromeTimedOut"] = timed_out
    evidence["sandboxStartupSucceeded"] = process.returncode == 0 and not timed_out
    evidence["ownedProbeLeaderReaped"] = True
if not evidence["sandboxStartupSucceeded"]:
    evidence["action"] = ("Chrome's default sandbox did not start under this host/container policy. "
        "Review the recorded namespace syscall refusals and host LSM/seccomp policy; "
        "an OpenSky capability manifest cannot grant denied kernel operations. "
        "Do not bypass Chrome's sandbox or replay desktop actions.")
(out / "sandbox-readiness.json").write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps({key: evidence[key] for key in ["uid", "namespaceChecks", "chromeExitCode", "sandboxStartupSucceeded", "desktopGUIVerified", "policyChanged"]}))
if args.require_ready and not evidence["sandboxStartupSucceeded"]: raise SystemExit(1)
