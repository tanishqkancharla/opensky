#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -s)" == Linux ]] || exit 2
[[ "${CUA_ATSPI_DEBUG:-}" == 1 ]] || exit 2
export OPENSKY_LINUX_OFFICE_ARTIFACT="$PWD/artifacts/linux-office"
export OPENSKY_DRIVER_BINARY="$PWD/.driver/opensky-driver"
export OPENSKY_EVAL_PYTHON="$(command -v python)"
mkdir -p "$OPENSKY_LINUX_OFFICE_ARTIFACT"
runtime=$(mktemp -d /tmp/opensky-refresh-XXXXXX)
export OPENSKY_DRIVER_SOCKET="$runtime/driver.sock"
export CUA_DRIVER_PERMISSION_MODE=unrestricted
export CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS=1
owned=()
cleanup() {
  local result=$?
  trap - EXIT
  set +e
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
  python - "$OPENSKY_LINUX_OFFICE_ARTIFACT" "$runtime" "$result" "${owned[@]}" <<'PYTHON'
import json, os, pathlib, sys
out, runtime, result = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), int(sys.argv[3])
alive = []
for pid in map(int, sys.argv[4:]):
    try: os.kill(pid, 0); alive.append(pid)
    except ProcessLookupError: pass
leftovers = sorted(str(p) for p in pathlib.Path('/tmp').glob('opensky-desktop-setup-*'))
app_cleanup = [json.loads(p.read_text()) for p in sorted((out/'setup').glob('*/cleanup.json'))]
report = {'exitCode': result, 'ownedPidsRemaining': alive, 'runtimeRemoved': not runtime.exists(),
          'fixtureTemporaryPathsRemaining': leftovers, 'appCleanup': app_cleanup,
          'status': 'passed' if not alive and not runtime.exists() and not leftovers and len(app_cleanup)==2 and all(x.get('verifiedExited') and x.get('status')=='passed' for x in app_cleanup) else 'failed'}
(out/'runner-cleanup.json').write_text(json.dumps(report, indent=2)+'\n')
if report['status'] != 'passed': raise SystemExit(1)
PYTHON
  local cleanup_result=$?
  [[ "$cleanup_result" == 0 ]] || result=1
  exit "$result"
}
trap cleanup EXIT
openbox > "$OPENSKY_LINUX_OFFICE_ARTIFACT/openbox.log" 2>&1 & owned+=("$!")
"$OPENSKY_DRIVER_BINARY" serve --no-overlay --socket "$OPENSKY_DRIVER_SOCKET" \
  > "$OPENSKY_LINUX_OFFICE_ARTIFACT/driver.log" 2>&1 & owned+=("$!")
export OPENSKY_OWNED_DRIVER_PID="$!"
ready=0
for attempt in $(seq 1 60); do
  if "$OPENSKY_DRIVER_BINARY" status --socket "$OPENSKY_DRIVER_SOCKET" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || exit 1
printf '%s\n' "$GITHUB_SHA" > "$OPENSKY_LINUX_OFFICE_ARTIFACT/sdk-source-sha.txt"
git ls-files -z src e2e/fixtures e2e/specs/linux-calc-refreshed-index.test.ts evals/parity | xargs -0 sha256sum > "$OPENSKY_LINUX_OFFICE_ARTIFACT/source-sha256.txt"
sha256sum e2e/ci/linux-calc-refreshed-index.sh .github/workflows/linux-typing.yml >> "$OPENSKY_LINUX_OFFICE_ARTIFACT/source-sha256.txt"
node --import tsx --input-type=module - <<'JS'
import {verifyDriverRuntime} from './evals/parity/driver-runtime.ts';
await verifyDriverRuntime({binaryPath:process.env.OPENSKY_DRIVER_BINARY, socket:process.env.OPENSKY_DRIVER_SOCKET,
  ownedLinuxPid:Number(process.env.OPENSKY_OWNED_DRIVER_PID),artifacts:process.env.OPENSKY_LINUX_OFFICE_ARTIFACT});
JS
python - <<'PYTHON'
import json, os, pathlib, platform, subprocess
out=pathlib.Path(os.environ['OPENSKY_LINUX_OFFICE_ARTIFACT'])
run=lambda args: subprocess.check_output(args,text=True).strip()
env={'sdkSource':os.environ['GITHUB_SHA'],'runId':os.environ['GITHUB_RUN_ID'], 'runAttempt':os.environ['GITHUB_RUN_ATTEMPT'],
     'osRelease':pathlib.Path('/etc/os-release').read_text(),'kernel':platform.release(),'architecture':platform.machine(),
     'node':run(['node','--version']),'python':platform.python_version(),'libreOffice':run(['libreoffice','--version']),
     'display':os.environ['DISPLAY'],'atspiDebug':os.environ['CUA_ATSPI_DEBUG'],
     'packages':run(['dpkg-query','-W','at-spi2-core','libreoffice-core','libreoffice-gtk3','openbox','xvfb'])}
(out/'environment.json').write_text(json.dumps(env,indent=2)+'\n')
PYTHON
cd e2e
npm test -- specs/linux-calc-refreshed-index.test.ts --testNamePattern '^REFRESH-L0[12]:' \
  --bail=0 --retry=0 --maxWorkers=1 --reporter=verbose --reporter=json \
  --outputFile.json="$OPENSKY_LINUX_OFFICE_ARTIFACT/results.json"
