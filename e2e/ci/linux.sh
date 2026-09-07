#!/usr/bin/env bash
set -euo pipefail
# Runner setup only. Test actions continue through the public OpenSky SDK.
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'This script is for disposable GitHub-hosted desktops.' >&2; exit 2; }
export OPENSKY_DRIVER_BINARY="$PWD/.driver/opensky-driver"
export OPENSKY_REAL_DRIVER=1
export OPENSKY_E2E_ARTIFACT_DIR="$PWD/artifacts/sdk-e2e"
mkdir -p "$OPENSKY_E2E_ARTIFACT_DIR"
# Keep the Unix socket below the platform path-length limit.
runtime_dir=$(mktemp -d /tmp/opensky-sdk-XXXXXX)
export OPENSKY_DRIVER_SOCKET="$runtime_dir/driver.sock"
export CUA_DRIVER_PERMISSION_MODE=unrestricted
export CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS=1
# Hosted Linux cannot sandbox Chrome's isolated profile; this is a runner limitation.
export CUA_E2E_BROWSER_NO_SANDBOX=1
export CUA_E2E_BROWSER_STDERR=1
owned_pids=()
recording_pid=
cleanup() {
  local result=$?
  trap - EXIT
  # Let ffmpeg finalize its container, but never let a child hang cleanup.
  if [[ -n "$recording_pid" ]]; then kill -INT "$recording_pid" 2>/dev/null || true; fi
  for pid in "${owned_pids[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  for attempt in $(seq 1 20); do
    alive=0
    for pid in "${owned_pids[@]}" "$recording_pid"; do
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then alive=1; fi
    done
    [[ "$alive" == 1 ]] || break
    sleep 0.25
  done
  for pid in "${owned_pids[@]}" "$recording_pid"; do
    [[ -n "$pid" ]] || continue
    kill -KILL "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
  if [[ -n "$recording_pid" ]]; then
    if ! ffprobe -v error -show_entries format=duration -of json \
      "$OPENSKY_E2E_ARTIFACT_DIR/desktop.mp4" > "$OPENSKY_E2E_ARTIFACT_DIR/recording.json"; then
      echo 'Desktop recording could not be validated' >&2
      [[ "$result" != 0 ]] || result=1
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
openbox > "$OPENSKY_E2E_ARTIFACT_DIR/openbox.log" 2>&1 & owned_pids+=("$!")
picom --backend xrender --config /dev/null > "$OPENSKY_E2E_ARTIFACT_DIR/picom.log" 2>&1 & owned_pids+=("$!")
sleep 2
"$OPENSKY_DRIVER_BINARY" --socket "$OPENSKY_DRIVER_SOCKET" serve --no-overlay > "$OPENSKY_E2E_ARTIFACT_DIR/driver.log" 2>&1 &
owned_pids+=("$!")
ready=0
for attempt in $(seq 1 60); do
  if "$OPENSKY_DRIVER_BINARY" --socket "$OPENSKY_DRIVER_SOCKET" status > "$OPENSKY_E2E_ARTIFACT_DIR/status.txt" 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'Driver did not become ready'; exit 1; }
"$OPENSKY_DRIVER_BINARY" --opensky-driver-identity > "$OPENSKY_E2E_ARTIFACT_DIR/identity.json"
printf '%s\n' "$GITHUB_SHA" > "$OPENSKY_E2E_ARTIFACT_DIR/sdk-source-sha.txt"
google-chrome --version > "$OPENSKY_E2E_ARTIFACT_DIR/browser-version.txt"
ffmpeg -nostdin -y -f x11grab -video_size 1280x900 -framerate 10 -i "$DISPLAY" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$OPENSKY_E2E_ARTIFACT_DIR/desktop.mp4" \
  > "$OPENSKY_E2E_ARTIFACT_DIR/recording.log" 2>&1 & recording_pid=$!
cd e2e
npm test -- specs/browser-success.test.ts specs/browser-rejections.test.ts \
  -t "$SDK_SCENARIO" --reporter=verbose --reporter=json \
  --outputFile.json="$OPENSKY_E2E_ARTIFACT_DIR/results.json" \
  2>&1 | tee "$OPENSKY_E2E_ARTIFACT_DIR/tests.log"
