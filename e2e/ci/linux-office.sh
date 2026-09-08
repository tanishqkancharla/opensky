#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true ]] || exit 2
export OPENSKY_LINUX_OFFICE_ARTIFACT="$PWD/artifacts/linux-office"
export OPENSKY_DRIVER_BINARY="$PWD/.driver/opensky-driver"
mkdir -p "$OPENSKY_LINUX_OFFICE_ARTIFACT"
runtime=$(mktemp -d /tmp/opensky-office-XXXXXX)
export OPENSKY_DRIVER_SOCKET="$runtime/driver.sock"
export CUA_DRIVER_PERMISSION_MODE=unrestricted
export CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS=1
owned=()
cleanup() {
  local result=$?
  trap - EXIT
  for pid in "${owned[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  for attempt in $(seq 1 20); do
    alive=0
    for pid in "${owned[@]}"; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [[ "$alive" == 1 ]] || break
    sleep 0.25
  done
  for pid in "${owned[@]}"; do kill -KILL "$pid" 2>/dev/null || true; done
  for pid in "${owned[@]}"; do wait "$pid" 2>/dev/null || true; done
  rm -rf "$runtime"
  exit "$result"
}
trap cleanup EXIT
openbox > "$OPENSKY_LINUX_OFFICE_ARTIFACT/openbox.log" 2>&1 & owned+=("$!")
"$OPENSKY_DRIVER_BINARY" serve --no-overlay --socket "$OPENSKY_DRIVER_SOCKET" \
  > "$OPENSKY_LINUX_OFFICE_ARTIFACT/driver.log" 2>&1 & owned+=("$!")
ready=0
for attempt in $(seq 1 60); do
  if "$OPENSKY_DRIVER_BINARY" status --socket "$OPENSKY_DRIVER_SOCKET" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || exit 1
"$OPENSKY_DRIVER_BINARY" --opensky-driver-identity > "$OPENSKY_LINUX_OFFICE_ARTIFACT/driver-identity.json"
libreoffice --version > "$OPENSKY_LINUX_OFFICE_ARTIFACT/libreoffice-version.txt"
printf '%s\n' "$GITHUB_SHA" > "$OPENSKY_LINUX_OFFICE_ARTIFACT/sdk-source-sha.txt"
cd e2e
npm test -- specs/linux-office.test.ts --reporter=verbose --reporter=json \
  --outputFile.json="$OPENSKY_LINUX_OFFICE_ARTIFACT/results.json"
