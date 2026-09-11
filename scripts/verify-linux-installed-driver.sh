#!/usr/bin/env bash
# The canonical local installer smoke, scoped to a disposable hosted runner.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux ]]
[[ "$CUA_DRIVER_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]
[[ $(git rev-parse HEAD) == "$CUA_DRIVER_SOURCE_SHA" ]]
for path in "$CUA_DRIVER_LOCAL_HOME" "$CUA_DRIVER_LOCAL_INSTALL_DIR" "$OPENSKY_INSTALL_ARTIFACT"; do
  [[ "$path" == "$RUNNER_TEMP/"* && ! -e "$path" ]]
done
mkdir "$OPENSKY_INSTALL_ARTIFACT"
socket="$RUNNER_TEMP/opensky-installed-smoke.sock"
[[ ! -e "$socket" ]]
daemon_pid=''
cleanup() {
  local result=$? exited=true
  trap - EXIT
  if [[ -n "$daemon_pid" ]]; then
    kill -TERM "$daemon_pid" 2>/dev/null || true
    for _ in $(seq 1 50); do
      kill -0 "$daemon_pid" 2>/dev/null || break
      sleep .1
    done
    if kill -0 "$daemon_pid" 2>/dev/null; then kill -KILL "$daemon_pid" 2>/dev/null || true; fi
    wait "$daemon_pid" 2>/dev/null || true
    if kill -0 "$daemon_pid" 2>/dev/null; then exited=false; result=1; fi
  fi
  if [[ "$exited" == true ]]; then
    rm -rf -- "$CUA_DRIVER_LOCAL_HOME" "$CUA_DRIVER_LOCAL_INSTALL_DIR"
    rm -f -- "$socket"
    [[ ! -e "$CUA_DRIVER_LOCAL_HOME" && ! -e "$CUA_DRIVER_LOCAL_INSTALL_DIR" && ! -e "$socket" ]]
  fi
  printf '{"daemonStarted":%s,"verifiedExited":%s,"temporaryRemoved":%s,"exitCode":%s}\n' \
    "$([[ -n "$daemon_pid" ]] && echo true || echo false)" "$exited" "$exited" "$result" > "$OPENSKY_INSTALL_ARTIFACT/cleanup.json"
  exit "$result"
}
trap cleanup EXIT
bash libs/cua-driver/scripts/install-local.sh --release 2>&1 | tee "$OPENSKY_INSTALL_ARTIFACT/install.log"
# The product was renamed; canonical smoke's old cua-driver-local path is stale.
installed="$CUA_DRIVER_LOCAL_INSTALL_DIR/opensky-driver"
test -x "$installed"
readlink -f "$installed" > "$OPENSKY_INSTALL_ARTIFACT/symlink-target.txt"
sha256sum "$installed" > "$OPENSKY_INSTALL_ARTIFACT/binary-sha256.txt"
"$installed" --version | tee "$OPENSKY_INSTALL_ARTIFACT/version.txt"
"$installed" --opensky-driver-identity > "$OPENSKY_INSTALL_ARTIFACT/identity.json"
python3 - <<'PY'
import json,os
from pathlib import Path
p=Path(os.environ['OPENSKY_INSTALL_ARTIFACT'])
x=json.loads((p/'identity.json').read_text())
assert x['product']=='opensky-driver' and x['source']==os.environ['CUA_DRIVER_SOURCE_SHA'] and x['protocolVersion']==1
assert Path((p/'symlink-target.txt').read_text().strip()).is_relative_to(Path(os.environ['CUA_DRIVER_LOCAL_HOME']))
PY
"$installed" serve --socket "$socket" > "$OPENSKY_INSTALL_ARTIFACT/daemon.log" 2>&1 &
daemon_pid=$!
for _ in $(seq 1 30); do
  [[ -S "$socket" ]] && break
  kill -0 "$daemon_pid"
  sleep 1
done
test -S "$socket"
"$installed" --socket "$socket" call get_config '{}' | tee "$OPENSKY_INSTALL_ARTIFACT/config.json"
grep -Fq "$CUA_DRIVER_SOURCE_SHA" "$OPENSKY_INSTALL_ARTIFACT/config.json"
