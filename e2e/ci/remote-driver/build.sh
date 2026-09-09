#!/usr/bin/env bash
# Run on the disposable Linux build host. Never registers a runner or starts GUI apps.
set -euo pipefail
if [[ $# != 4 || ${1:-} == --help ]]; then
  echo 'Usage: bash build.sh DRIVER_GIT_CHECKOUT FULL_COMMIT_SHA BUILDER_IMAGE NEW_OUTPUT_DIRECTORY'
  echo 'Docker image must be built from the adjacent Dockerfile; persistent Cargo caches are Docker volumes.'
  [[ ${1:-} == --help ]] && exit 0 || exit 2
fi
[[ $(uname -s) == Linux ]] || { echo 'Run this helper on the remote Linux host.' >&2; exit 2; }
repo=$1
revision=$2
builder=$3
output=$4
[[ $revision =~ ^[0-9a-f]{40}$ ]] || { echo 'An exact full commit SHA is required.' >&2; exit 2; }
[[ $(git -C "$repo" rev-parse "$revision^{commit}") == "$revision" ]] || exit 2
image_id=$(docker image inspect --format '{{.Id}}' "$builder")
[[ $image_id =~ ^sha256:[0-9a-f]{64}$ ]] || exit 2
# Exact image identity namespaces the reusable compiler and dependency caches.
cache="opensky-driver-${image_id#sha256:}"
mkdir "$output"
output=$(cd "$output" && pwd)
[[ $output != *,* ]] || { echo 'Docker mount output paths cannot contain commas.' >&2; exit 2; }
scratch=$(mktemp -d)
container="opensky-driver-build-$$-$RANDOM"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
# Include adjacent embedded resources such as wayland-helper, not only Rust files.
git -C "$repo" archive "$revision:libs/cua-driver" | tar -x -C "$scratch"
git -C "$repo" rev-parse "$revision:libs/cua-driver" > "$output/source-tree.txt"
printf '%s\n' "$image_id" > "$output/builder-image.txt"
printf '%s\n' "$revision" > "$output/source-sha.txt"
# Lock the shared target directory: simultaneous Cargo builds must not mutate it.
exec 9>"/tmp/$cache.lock"
flock 9
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
set +e
docker run --rm --name "$container" --cpus 2 --memory 4g \
  --mount "type=bind,src=$scratch,dst=/src,readonly" \
  --mount "type=bind,src=$output,dst=/artifacts" \
  --mount "type=volume,src=$cache-target,dst=/target" \
  --mount "type=volume,src=$cache-registry,dst=/opt/cargo/registry" \
  --mount "type=volume,src=$cache-git,dst=/opt/cargo/git" \
  -e CARGO_TARGET_DIR=/target -e CARGO_INCREMENTAL=0 -e CARGO_PROFILE_DEV_DEBUG=0 \
  -e CUA_DRIVER_SOURCE_SHA="$revision" -e EXPECTED_SOURCE_SHA="$revision" \
  "$image_id" bash -euo pipefail -c '
    rustc -Vv > /artifacts/rustc.txt
    cargo -V > /artifacts/cargo.txt
    cargo build --locked -p cua-driver
    cargo test --locked -p platform-linux --lib text_keysyms_cover_latin1_unicode_and_control_keys
    cargo test --locked -p platform-linux --lib hotkey_alias_tests
    cargo test --locked -p platform-linux --lib virtual_table_tests
    cargo test --locked -p platform-linux --lib atspi::native::coord_tests
    cargo test --locked -p platform-linux --lib frame_correlation_tests
    cargo test --locked -p cua-driver-core --lib element_token::tests
    cargo test --locked -p cua-driver-core --lib every_known_legacy_action_path_normalizes
    cp /target/debug/cua-driver /artifacts/opensky-driver
    /artifacts/opensky-driver --opensky-driver-identity > /artifacts/identity.json
    python3 -c '\''import json,os; d=json.load(open("/artifacts/identity.json")); assert d["product"] == "opensky-driver" and d["protocolVersion"] == 1 and d["source"] == os.environ["EXPECTED_SOURCE_SHA"]'\''
    cd /artifacts
    sha256sum opensky-driver > sha256.txt
  ' 2>&1 | tee "$output/build.log"
pipeline_status=("${PIPESTATUS[@]}")
result=${pipeline_status[0]}
if [[ $result == 0 && ${pipeline_status[1]} != 0 ]]; then
  result=${pipeline_status[1]}
fi
set -e
python3 - "$output" "$started" "$result" <<'PY'
import datetime, json, pathlib, sys
out = pathlib.Path(sys.argv[1])
end = datetime.datetime.now(datetime.timezone.utc)
start = datetime.datetime.fromisoformat(sys.argv[2].replace("Z", "+00:00"))
(out / "build-result.json").write_text(json.dumps({
    "source": (out / "source-sha.txt").read_text().strip(),
    "builderImage": (out / "builder-image.txt").read_text().strip(),
    "startedAt": sys.argv[2], "finishedAt": end.isoformat(),
    "elapsedSeconds": (end - start).total_seconds(), "exitCode": int(sys.argv[3]),
    "scope": "build-and-focused-rust-checks; no GUI acceptance",
}, indent=2) + "\n")
PY
exit "$result"
