#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -s)" == Linux ]] || exit 2
artifact="$PWD/artifacts/native-linux"
mkdir -p "$artifact"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
# Official download linked from https://learn.chatgpt.com/docs/linux/linux-app.
# This is an availability probe; a future matched campaign must pin this digest.
url=https://persistent.oaistatic.com/codex-app-prod/linux/deb/latest/chatgpt_amd64.deb
printf '%s\n' "$url" > "$artifact/source-url.txt"
curl --fail --location --retry 2 "$url" --output "$scratch/chatgpt.deb"
sha256sum "$scratch/chatgpt.deb" > "$artifact/package-sha256.txt"
dpkg-deb --field "$scratch/chatgpt.deb" Package Version Architecture > "$artifact/package.txt"
dpkg-deb --extract "$scratch/chatgpt.deb" "$scratch/app"
python3 - "$scratch/app" "$artifact" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])
packages=[p for p in root.rglob('package.json') if p.parent.name=='sky' and p.parent.parent.name=='@oai']
binaries=[p.parent/'bin/linux/sky_linux_x64' for p in packages if (p.parent/'bin/linux/sky_linux_x64').is_file()]
executables=[str(p.relative_to(root)) for name in ('node_repl', 'codex') for p in root.rglob(name) if p.is_file()]
report={'packages':[str(p.relative_to(root)) for p in packages], 'binaries':[str(p.relative_to(root)) for p in binaries], 'agentExecutables':sorted(executables), 'nativeComparisonReady':False}
(out/'availability.json').write_text(json.dumps(report,indent=2)+'\n')
if len(packages)!=1 or len(binaries)!=1:
    raise SystemExit('Official package does not expose one runnable Linux native reference. See availability.json; no substitute backend was used.')
(out/'package-path.txt').write_text(str(packages[0].parent))
(out/'binary-path.txt').write_text(str(binaries[0]))
PY
export OPENSKY_NATIVE_PROBE_PACKAGE="$(cat "$artifact/package-path.txt")"
export OAI_SKY_LINUX_BIN="$(cat "$artifact/binary-path.txt")"
export OPENSKY_NATIVE_PROBE_ARTIFACT="$artifact"
chmod +x "$OAI_SKY_LINUX_BIN"
xvfb-run -a --server-args='-screen 0 1280x900x24' dbus-run-session -- \
  node e2e/ci/native-linux-probe.mjs
if [[ -n "${OPENSKY_LINUX_OFFICE_BACKEND:-}" ]]; then
  xvfb-run -a --server-args='-screen 0 1280x900x24' dbus-run-session -- \
    bash e2e/ci/linux-office.sh
fi
