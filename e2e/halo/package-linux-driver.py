"""Build a source-addressed Bookworm archive; never download or publish executables."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile


def run(*args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, text=True, timeout=120).strip()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


root = Path.cwd()
source = root / "driver"
rust = source / "libs/cua-driver/rust"
binary = rust / "target/release/cua-driver"
out = root / "artifacts/driver-release"
out.mkdir(parents=True, exist_ok=True)
pin = json.loads((root / "driver-source.json").read_text())["verifiedCommit"]
assert re.fullmatch(r"[0-9a-f]{40}", pin)
assert run("git", "rev-parse", "HEAD", cwd=source) == pin
assert not run("git", "status", "--porcelain", "--untracked-files=no", cwd=source)
identity = json.loads(run(str(binary), "--opensky-driver-identity"))
assert identity["source"] == pin and identity["product"] == "opensky-driver"
version = identity["version"]
assert re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version)
version_output = run(str(binary), "--version")
assert version in version_output
assert run("dpkg", "--print-architecture") == "amd64"
assert 'VERSION_CODENAME=bookworm' in Path('/etc/os-release').read_text()
elf = run("readelf", "-h", str(binary))
assert "ELF64" in elf and "Advanced Micro Devices X86-64" in elf
needed = run("readelf", "-d", str(binary))
linked = run("ldd", str(binary))
assert "not found" not in linked
symbols = run("readelf", "--version-info", str(binary))
# Record all actually required ABI versions rather than promising generic Linux.
abi = sorted(set(re.findall(r"Name: ((?:GLIBC|GLIBCXX|CXXABI)_[0-9.]+)", symbols)))
name = f"opensky-driver-{version}-{pin}-linux-x86_64-gnu-bookworm"
stage = out / name
stage.mkdir()
shutil.copy2(binary, stage / "opensky-driver")
(stage / "opensky-driver").chmod(0o755)
shutil.copy2(source / "LICENSE.md", stage / "LICENSE.md")
metadata = json.loads(run("cargo", "metadata", "--locked", "--format-version", "1", "--filter-platform", "x86_64-unknown-linux-gnu", "--manifest-path", str(rust / "Cargo.toml")))
packages = {p["id"]: p for p in metadata["packages"]}
nodes = {p["id"]: p for p in metadata["resolve"]["nodes"]}
entry = next(p["id"] for p in metadata["packages"] if p["name"] == "cua-driver")
seen, pending = set(), [entry]
while pending:
    key = pending.pop()
    if key in seen: continue
    seen.add(key)
    pending.extend(d["pkg"] for d in nodes[key]["deps"])
licenses = []
for key in sorted(seen):
    p = packages[key]
    folder = Path(p["manifest_path"]).parent
    target = stage / "licenses" / (p["name"] + "-" + p["version"])
    copied = []
    for path in sorted(folder.iterdir()):
        if path.name.lower().startswith(("license", "licence", "copying", "notice", "copyright")):
            target.mkdir(parents=True, exist_ok=True)
            if path.is_file(): shutil.copy2(path, target / path.name)
            elif path.is_dir(): shutil.copytree(path, target / path.name)
            copied.append(path.name)
    licenses.append({"name":p["name"], "version":p["version"], "license":p["license"], "repository":p["repository"], "includedNotices":copied})
(stage / "THIRD_PARTY.json").write_text(json.dumps(licenses, indent=2) + "\n")
provenance = {
    "schemaVersion": 1, "product": "opensky-driver", "version":version,
    "sourceRepository":"https://github.com/tanishqkancharla/cua", "sourceCommit":pin,
    "sdkCommit":run("git", "rev-parse", "HEAD"), "identity":identity,
    "binarySHA256":sha(binary), "versionOutput":version_output,
    "target":"x86_64-unknown-linux-gnu", "supportedOS":"Debian 12 Bookworm amd64",
    "libc":"glibc 2.36", "osRelease":Path('/etc/os-release').read_text(),
    "rustc":run("rustc", "-Vv"), "cargo":run("cargo", "-V"), "node":run("node", "--version"),
    "cargoLockSHA256":sha(rust / "Cargo.lock"),
    "buildCommand":"cargo build --release --locked -p cua-driver",
    "buildEnvironment":{k:os.environ[k] for k in ("CARGO_PROFILE_RELEASE_LTO", "CARGO_PROFILE_RELEASE_CODEGEN_UNITS", "CARGO_INCREMENTAL", "CUA_DRIVER_SOURCE_SHA")},
    "features":"default (no review trust-root override)",
    "dtNeeded": re.findall(r"Shared library: \[([^]]+)\]", needed),
    "requiredSymbolVersions":abi, "ldd":linked,
    "ciRunURL":f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
    "desktopQualification":"Pending; publication requires separate successful extracted-binary native/strict/Stop/rebind contracts and cleanup receipts. No Bookworm browser claim."
}
(stage / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
(stage / "SHA256SUMS").write_text(''.join(f"{sha(p)}  {p.relative_to(stage)}\n" for p in sorted(stage.rglob('*')) if p.is_file()))
archive = out / (name + ".tar.gz")
with tarfile.open(archive, "w:gz") as tar:
    tar.add(stage, arcname=name)
(out / "SHA256SUMS").write_text(f"{sha(archive)}  {archive.name}\n")
shutil.copy2(stage / "provenance.json", out / "provenance.json")
(out / "archive.json").write_text(json.dumps({"file":archive.name,"sha256":sha(archive),"binarySHA256":sha(binary),"directory":name,"sourceCommit":pin,"version":version},indent=2)+"\n")
# Exercise a newly extracted copy, not the original Cargo output, below.
extracted = out / "extracted"
extracted.mkdir()
with tarfile.open(archive) as tar: tar.extractall(extracted, filter="data")
copy = extracted / name / "opensky-driver"
assert sha(copy) == provenance["binarySHA256"]
assert json.loads(run(str(copy), "--opensky-driver-identity")) == identity
assert run(str(copy), "--version") == version_output
shutil.copy2(copy, binary)
print(json.dumps({"archive":archive.name,"sha256":sha(archive),"binarySHA256":sha(binary)}))
