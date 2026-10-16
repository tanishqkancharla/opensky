#!/usr/bin/env bash
set -euo pipefail
export DISPLAY=:1 XDG_SESSION_TYPE=x11 NO_AT_BRIDGE=0 GTK_MODULES=gail:atk-bridge
export HALO_ARTIFACTS="${HALO_ARTIFACTS:-$PWD/artifacts/halo}"
mkdir -p "$HALO_ARTIFACTS"
export XDG_RUNTIME_DIR="$(mktemp -d /tmp/halo-runtime.XXXXXX)"
chmod 700 "$XDG_RUNTIME_DIR"
cleanup() {
  local status
  : > "$HALO_ARTIFACTS/supervisor-cleanup.txt"
  for pid in "${daemon_pid:-}" "${browser_daemon_pid:-}" "${editor_pid:-}" "${wm_pid:-}" "${panel_pid:-}" "${vnc_pid:-}" "${clipboard_pid:-}"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      for attempt in {1..50}; do if ! kill -0 "$pid" 2>/dev/null; then break; fi; sleep .1; done
      forced=no
      if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; forced=yes; fi
      status=0; wait "$pid" 2>/dev/null || status=$?
      printf "owned_pid=%s wait_status=%s exited=yes forced=%s\n" "$pid" "$status" "$forced" >> "$HALO_ARTIFACTS/supervisor-cleanup.txt"
    fi
  done
  rm -rf "$XDG_RUNTIME_DIR"
}
trap cleanup EXIT
Xtigervnc :1 -localhost -SecurityTypes None -geometry 1280x900 -depth 24 > "$HALO_ARTIFACTS/vnc.log" 2>&1 & vnc_pid=$!
for attempt in {1..100}; do if xdpyinfo >/dev/null 2>&1; then break; fi; sleep .1; done
xdpyinfo > "$HALO_ARTIFACTS/xdpyinfo.txt"
xfwm4 --replace --compositor="${HALO_COMPOSITOR:-off}" > "$HALO_ARTIFACTS/xfwm.log" 2>&1 & wm_pid=$!
xfce4-panel > "$HALO_ARTIFACTS/panel.log" 2>&1 & panel_pid=$!
gsettings set org.gnome.desktop.interface toolkit-accessibility true
/usr/bin/python3 e2e/halo/editor.py > "$HALO_ARTIFACTS/editor.log" 2>&1 & editor_pid=$!
for attempt in {1..100}; do if [[ -s "$HALO_ARTIFACTS/editor-state.json" ]]; then break; fi; sleep .1; done
editor_window=$(xdotool search --sync --onlyvisible --name '^Halo Contract Editor$' | head -1)
wmctrl -ia "$editor_window"
printf 'preserved clipboard sentinel Ελληνικά' | xclip -selection clipboard -loops 0 -quiet & clipboard_pid=$!
export HALO_EDITOR_PID="$editor_pid" HALO_EDITOR_WINDOW="$editor_window"
if [[ "${HALO_NATIVE_PASTE_PROBE_ONLY:-0}" == "1" ]]; then
  timeout --signal=TERM --kill-after=5s 45s /usr/bin/python3 e2e/halo/paste-probe.py
  exit 0
fi
mkdir -p "$HALO_ARTIFACTS/capture-sdk-shots"
chmod 700 "$HALO_ARTIFACTS/capture-sdk-shots"
cat > "$HALO_ARTIFACTS/native-grants.yaml" <<EOF
version: 3
expires_after: 1h
idle_timeout: 30m
resources:
  files:
    write:
      - dir: "$HALO_ARTIFACTS/capture-sdk-shots"
        recursive: false
  desktop:
    display: true
    applications: [$editor_pid]
    windows:
      - pid: $editor_pid
        window_id: $editor_window
allow:
  tools: [start_session, end_session, list_apps, list_windows, get_window_state, type_text, hotkey, press_key, bring_to_front, native_paste]
EOF
if [[ "${HALO_NATIVE_CAPTURE_ONLY:-0}" != "1" ]]; then
  /usr/bin/python3 - <<'PY_GRANT'
import os, pathlib
p = pathlib.Path(os.environ["HALO_ARTIFACTS"]) / "native-grants.yaml"
s = p.read_text().replace("resources:\n", "resources:\n  clipboard:\n    write: [text]\n", 1)
s = s.replace("bring_to_front, native_paste]", "bring_to_front, native_paste, clipboard_read]")
p.write_text(s)
PY_GRANT
else
  sed -i 's/, native_paste]/]/' "$HALO_ARTIFACTS/native-grants.yaml"
fi
cat > "$HALO_ARTIFACTS/browser-grants.yaml" <<EOF
version: 2
mode: bounded
expires_after: 1h
idle_timeout: 30m
resources:
  apps:
    - executable: /opt/google/chrome/chrome
      launch: true
      windows: all
      terminate: driver_launched
  browser:
    profiles:
      - kind: isolated
    origins: ['http://127.0.0.1:8123']
  desktop:
    display: true
allow:
  tools: [start_session, end_session, list_apps, list_windows, get_browser_state, browser_prepare, browser_navigate, browser_click, browser_pointer, browser_key, close_window]
EOF
if [[ "${HALO_NATIVE_CONTRACT_ONLY:-0}" == "1" ]]; then
  # Same native operation/target grants, deliberately no clipboard resource.
  /usr/bin/python3 - <<'PY_DENIAL'
import os, pathlib
out = pathlib.Path(os.environ["HALO_ARTIFACTS"])
s = (out / "native-grants.yaml").read_text().replace("  clipboard:\n    write: [text]\n", "")
(out / "browser-grants.yaml").write_text(s)
PY_DENIAL
fi
export OPENSKY_DRIVER_PATH="$PWD/driver/libs/cua-driver/rust/target/release/cua-driver"
export HALO_DRIVER_SOCKET="$XDG_RUNTIME_DIR/driver.sock"
"$OPENSKY_DRIVER_PATH" --socket "$HALO_DRIVER_SOCKET" serve --pid-file "$XDG_RUNTIME_DIR/native.pid" --no-overlay --permission-mode bounded --capability-manifest "$HALO_ARTIFACTS/native-grants.yaml" --approve-capability-manifest > "$HALO_ARTIFACTS/driver.log" 2>&1 & daemon_pid=$!
export HALO_BROWSER_SOCKET="$XDG_RUNTIME_DIR/browser.sock"
"$OPENSKY_DRIVER_PATH" --socket "$HALO_BROWSER_SOCKET" serve --pid-file "$XDG_RUNTIME_DIR/browser.pid" --no-overlay --permission-mode bounded --capability-manifest "$HALO_ARTIFACTS/browser-grants.yaml" --approve-capability-manifest > "$HALO_ARTIFACTS/browser-driver.log" 2>&1 & browser_daemon_pid=$!
node e2e/halo/session-check.mjs
timeout --signal=TERM --kill-after=5s 60s node --import tsx e2e/halo/strict-bridge.mjs
if [[ "${HALO_NATIVE_CONTRACT_ONLY:-0}" == "1" ]]; then
  timeout --signal=TERM --kill-after=5s 120s node e2e/halo/contract.mjs
elif [[ "${HALO_NATIVE_CAPTURE_ONLY:-0}" == "1" ]]; then
  # Observation deadlines never claim daemon cancellation. This owned fixture
  # has a bounded process-group watchdog; supervisor shutdown establishes exit.
  timeout --signal=TERM --kill-after=5s 90s node e2e/halo/capture.mjs
else
  node e2e/halo/contract.mjs
fi
