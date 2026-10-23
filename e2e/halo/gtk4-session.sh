#!/usr/bin/env bash
set -euo pipefail
export DISPLAY=:1 XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 NO_AT_BRIDGE=0
export XDG_CURRENT_DESKTOP=XFCE XDG_SESSION_DESKTOP=xfce
: "${HALO_ARTIFACTS:?Owned GTK4 artifact directory required}"
export XDG_RUNTIME_DIR="$(mktemp -d /tmp/opensky-gtk4.XXXXXX)"
chmod 700 "$XDG_RUNTIME_DIR"
cleanup() {
  local original=$? failed=0 status forced
  trap - EXIT
  : > "$HALO_ARTIFACTS/supervisor-cleanup.txt"
  for pid in "${daemon_pid:-}" "${app_pid:-}" "${wm_pid:-}" "${vnc_pid:-}"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      for attempt in {1..50}; do if ! kill -0 "$pid" 2>/dev/null; then break; fi; sleep .1; done
      forced=no
      if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; forced=yes; failed=1; fi
      status=0; wait "$pid" 2>/dev/null || status=$?
      printf 'owned_pid=%s wait_status=%s exited=yes forced=%s\n' "$pid" "$status" "$forced" >> "$HALO_ARTIFACTS/supervisor-cleanup.txt"
    fi
  done
  rmdir "$XDG_RUNTIME_DIR" 2>/dev/null || true
  if (( original != 0 )); then exit "$original"; fi
  exit "$failed"
}
trap cleanup EXIT
Xtigervnc :1 -localhost -SecurityTypes None -geometry 1280x900 -depth 24 > "$HALO_ARTIFACTS/vnc.log" 2>&1 & vnc_pid=$!
ready=0; for attempt in {1..100}; do if xdpyinfo > "$HALO_ARTIFACTS/xdpyinfo.txt" 2>/dev/null; then ready=1; break; fi; sleep .1; done
(( ready == 1 ))
xfwm4 --replace --compositor=on > "$HALO_ARTIFACTS/xfwm.log" 2>&1 & wm_pid=$!
ready=0; for attempt in {1..100}; do if wmctrl -m > "$HALO_ARTIFACTS/window-manager.txt" 2>/dev/null && [[ "$(cat "$HALO_ARTIFACTS/window-manager.txt")" == *"Name: Xfwm4"* ]]; then ready=1; break; fi; sleep .1; done
(( ready == 1 ))
gsettings set org.gnome.desktop.interface toolkit-accessibility true
/usr/bin/python3 e2e/halo/gtk4-editor.py > "$HALO_ARTIFACTS/app.log" 2>&1 & app_pid=$!
ready=0; for attempt in {1..100}; do if [[ -s "$HALO_ARTIFACTS/state.json" ]]; then ready=1; break; fi; sleep .1; done
(( ready == 1 ))
window=$(timeout 10s xdotool search --sync --onlyvisible --name '^OpenSky GTK4 Ownership$' | head -1)
wmctrl -ia "$window"
xprop -id "$window" _GTK_FRAME_EXTENTS _NET_FRAME_EXTENTS _NET_WM_PID > "$HALO_ARTIFACTS/window-properties.txt"
export HALO_GTK4_PID="$app_pid" HALO_GTK4_WINDOW="$window"
mkdir -p "$HALO_ARTIFACTS/shots"
extra_tools=""
if [[ "${HALO_POPUP_PROBE:-0}" == "1" ]]; then extra_tools=", press_key, type_text"; fi
cat > "$HALO_ARTIFACTS/grants.yaml" <<EOF
version: 3
expires_after: 10m
idle_timeout: 5m
resources:
  files:
    write:
      - dir: "$HALO_ARTIFACTS/shots"
        recursive: false
  desktop:
    display: true
    applications: [$app_pid]
    windows:
      - pid: $app_pid
        window_id: $window
allow:
  tools: [start_session, end_session, list_apps, list_windows, get_window_state, bring_to_front, click${extra_tools}]
EOF
export OPENSKY_DRIVER_PATH="$PWD/driver/libs/cua-driver/rust/target/release/cua-driver"
export HALO_DRIVER_SOCKET="$XDG_RUNTIME_DIR/d.sock"
"$OPENSKY_DRIVER_PATH" --opensky-driver-identity > "$HALO_ARTIFACTS/identity.json"
"$OPENSKY_DRIVER_PATH" --socket "$HALO_DRIVER_SOCKET" serve --pid-file "$XDG_RUNTIME_DIR/driver.pid" --no-overlay --permission-mode bounded --capability-manifest "$HALO_ARTIFACTS/grants.yaml" --approve-capability-manifest > "$HALO_ARTIFACTS/driver.log" 2>&1 & daemon_pid=$!
ready=0; for attempt in {1..100}; do if [[ -S "$HALO_DRIVER_SOCKET" ]]; then ready=1; break; fi; sleep .1; done
(( ready == 1 ))
timeout --signal=TERM --kill-after=5s 90s node e2e/halo/gtk4-contract.mjs
