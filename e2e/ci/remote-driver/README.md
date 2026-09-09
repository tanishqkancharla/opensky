# Reuse the remote Linux compiler cache

This optional one-off build path avoids queuing a new GitHub job and downloading
its driver artifact for every diagnostic candidate. It builds committed source,
runs the same six focused Rust checks as `linux-typing.yml`, verifies the embedded
source identity, and leaves a binary hash, compiler versions, build log and timing
receipt. It does not register a runner, run paid agents or launch desktop apps.

On the remote Linux VM, build the image once, using the version in the driver's
`libs/cua-driver/rust/rust-toolchain.toml`:

```sh
docker build --build-arg RUST_VERSION=1.97.1 \
  -t opensky-driver-builder:1.97.1 e2e/ci/remote-driver
bash e2e/ci/remote-driver/build.sh /path/to/driver-checkout \
  FULL_40_CHARACTER_COMMIT_SHA opensky-driver-builder:1.97.1 \
  /path/to/new-candidate-artifacts
```

The checkout must already contain the selected commit. Uncommitted changes and
the checkout's current branch are ignored. Each output directory must be new.
The helper archives `libs/cua-driver`, including the Rust workspace and embedded
resources such as `wayland-helper`, into a temporary read-only mount,
which is removed on exit. Named Docker volumes retain Cargo target, registry and
Git dependency caches, namespaced by the exact builder image ID. A host `flock`
serializes builds against that target cache. The container exits and is removed.
Only build caches and requested artifacts persist. No repository or model
credentials are passed into the build container.

The first build still installs dependencies and compiles everything. Subsequent
builds can reuse unchanged dependencies; changed crates still compile. Image or
toolchain changes intentionally create a new cache. After retiring an image,
remove its three `opensky-driver-<image digest>-{target,registry,git}` volumes
explicitly if reclaiming disk space is needed; the helper never prunes other
Docker resources.

Validation so far is limited to shell syntax, help/argument handling and review
against the hosted workflow. The helper has not yet built a driver on the VM,
and no measured end-to-end speedup is claimed. Record cold and warm build times
from `build-result.json` when trying it. Interrupted builds may lack a terminal
receipt and must not be interpreted as success.

This is diagnostic build evidence only. Run the unchanged public SDK checks on
the exact resulting binary, and retain hosted and canonical matrix acceptance
requirements. It does not promote a candidate or replace final CI validation.
