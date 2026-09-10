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
  if [[ -f "${OPENSKY_REMOTE_BUDGET:-}" ]]; then cp "$OPENSKY_REMOTE_BUDGET" "$OPENSKY_LINUX_OFFICE_ARTIFACT/budget.json"; fi
  rm -rf "$runtime"
  exit "$result"
}
trap cleanup EXIT
openbox > "$OPENSKY_LINUX_OFFICE_ARTIFACT/openbox.log" 2>&1 & owned+=("$!")
"$OPENSKY_DRIVER_BINARY" serve --no-overlay --socket "$OPENSKY_DRIVER_SOCKET" \
  > "$OPENSKY_LINUX_OFFICE_ARTIFACT/driver.log" 2>&1 & owned+=("$!")
export OPENSKY_OWNED_DRIVER_PID="$!"
export OPENSKY_EVAL_PYTHON="$(command -v python)"
ready=0
for attempt in $(seq 1 60); do
  if "$OPENSKY_DRIVER_BINARY" status --socket "$OPENSKY_DRIVER_SOCKET" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || exit 1
"$OPENSKY_DRIVER_BINARY" --opensky-driver-identity > "$OPENSKY_LINUX_OFFICE_ARTIFACT/driver-identity.json"
libreoffice --version > "$OPENSKY_LINUX_OFFICE_ARTIFACT/libreoffice-version.txt"
printf '%s\n' "$GITHUB_SHA" > "$OPENSKY_LINUX_OFFICE_ARTIFACT/sdk-source-sha.txt"
node --import tsx e2e/ci/linux-environment.ts
if [[ "${OPENSKY_LINUX_AGENT_MODE:-}" == repl ]]; then
  export OPENSKY_DISPOSABLE_DESKTOP=1
  case "${OPENSKY_REPL_CASE:-async-typing}" in
    async-typing) repl_spec=specs/linux-repl-cell.test.ts ;;
    dropdown) repl_spec=specs/linux-dropdown-repl.test.ts ;;
    *) echo 'Unknown public REPL regression'; exit 2 ;;
  esac
  cd e2e
  npm test -- "$repl_spec" --reporter=verbose --reporter=json \
    --outputFile.json="$OPENSKY_LINUX_OFFICE_ARTIFACT/results.json"
  exit
fi
if [[ -n "${OPENSKY_LINUX_AGENT_MODE:-}" ]]; then
  if [[ "$OPENSKY_LINUX_AGENT_MODE" == agent ]]; then
    export CODEX_HOME="$runtime/codex"
    mkdir -p "$CODEX_HOME"
    printf '%s\n' "$OPENAI_API_KEY" | "$OPENSKY_NATIVE_PROBE_PACKAGE/../../../../../codex" login --with-api-key
    unset OPENAI_API_KEY
  else
    export OPENSKY_AGENT_BACKEND=setup
  fi
  node --import tsx evals/parity/osworld/linux-smoke.ts "$OPENSKY_AGENT_TASK" "$OPENSKY_AGENT_BACKEND" "$OPENSKY_LINUX_OFFICE_ARTIFACT"
  exit
fi
cd e2e
scenario=specs/linux-office.test.ts
scenario_args=()
if [[ "${OPENSKY_LINUX_TYPING_TEST:-}" == 1 ]]; then
  scenario=specs/linux-typing.test.ts
  scenario_args+=(--bail=0)
fi
npm test -- "$scenario" "${scenario_args[@]}" --reporter=verbose --reporter=json \
  --outputFile.json="$OPENSKY_LINUX_OFFICE_ARTIFACT/results.json"
