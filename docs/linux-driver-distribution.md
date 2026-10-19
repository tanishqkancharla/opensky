# Linux driver binary distribution

The SDK release includes `driver-assets.json`, also exported as
`opensky-cua/driver-assets.json`. Its `sourceCommit` must equal
`driver-source.json.verifiedCommit`. Each asset records a fixed release URL,
archive SHA-256, executable SHA-256, driver version, target, ABI and qualification
run. Consumers must pin this metadata and checksum; do not resolve `latest` at
container startup. OpenSky does not download or install a driver automatically.

For example, on Node 22:

```js
import driverAssets from 'opensky-cua/driver-assets.json' with { type: 'json' };
const asset = driverAssets.assets.find(a => a.platform === 'linux' && a.arch === 'x64');
console.log(asset.url, asset.sha256, driverAssets.sourceCommit);
```

## Supported target

Debian 12 Bookworm, Linux amd64, `x86_64-unknown-linux-gnu`, glibc 2.36.
This binary is dynamically linked. `provenance.json` in the archive records exact
DT_NEEDED libraries, required GLIBC symbol versions, resolved build libraries,
Rust/Cargo/Node versions, Cargo.lock hash, Cargo settings and both source commits.
`THIRD_PARTY.json`, included notices and the MIT license accompany the executable.
This is a qualification boundary, not a claim that older glibc, Alpine/musl,
arm64, Wayland or other distributions work.

The clean consumer installs these driver runtime packages:

```sh
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl \
  libdbus-1-3 libx11-6 libxi6 libxtst6 libxext6 libxkbcommon0 libssl3 \
  libxrender1 libxfixes3 libxrandr2 libxcursor1
```

For native accessibility also provide a shared session D-Bus and AT-SPI bridge:
`dbus-x11 at-spi2-core libatk-adaptor`, accessible application processes, and
`DISPLAY=:1`. The test desktop additionally uses TigerVNC, XFWM4/XFCE panel,
GTK3/Python-GI, xdotool/wmctrl/xclip and fonts. Halo's existing desktop can provide
those components; Rust and Cargo are unnecessary when consuming the binary.

## Container installation

Read the archive URL, SHA-256 and root directory from the metadata shipped with
the pinned SDK. Verify the archive **before** extracting or executing it:

```dockerfile
# Debian Bookworm amd64; install the runtime packages above first.
ARG OPENSKY_DRIVER_URL=https://github.com/tanishqkancharla/opensky/releases/download/v0.2.32/opensky-driver-0.36.0-034fd65a068f303e863af09ab035b12b94dd27e1-linux-x86_64-gnu-bookworm.tar.gz
ARG OPENSKY_DRIVER_SHA256=b90923f16e2f8b53ec310ba4d12b7e05321fcb8bf04657aa6c5bf84c95063356
RUN curl -fSL "$OPENSKY_DRIVER_URL" -o /tmp/opensky-driver.tar.gz \
 && printf '%s  %s\n' "$OPENSKY_DRIVER_SHA256" /tmp/opensky-driver.tar.gz | sha256sum -c - \
 && mkdir -p /opt/opensky \
 && tar -xzf /tmp/opensky-driver.tar.gz --strip-components=1 -C /opt/opensky \
 && rm /tmp/opensky-driver.tar.gz
ENV OPENSKY_DRIVER_BINARY=/opt/opensky/opensky-driver
RUN /opt/opensky/opensky-driver --version \
 && /opt/opensky/opensky-driver --opensky-driver-identity > /opt/opensky/identity.json \
 && node -e 'const i=require("/opt/opensky/identity.json"); if(i.product!=="opensky-driver" || i.protocolVersion!==1 || i.version!=="0.36.0" || i.source!=="034fd65a068f303e863af09ab035b12b94dd27e1") process.exit(1)'

```

Keep the identity check: product `opensky-driver`, protocolVersion `1`, version
`0.36.0`, source `034fd65a068f303e863af09ab035b12b94dd27e1`. The SDK still verifies
fork product/protocol compatibility; Halo must keep its exact-source check above.
The archive preserves daemon ownership, grants,
action completion/drain, clipboard or foreground semantics. Install files as
root or another trusted owner; run the driver as the ordinary desktop user.
A binary path override selects this executable; it does not grant permissions.

## Verification and limitations

[Qualification39217544182](https://github.com/tanishqkancharla/opensky/actions/runs/39217544182) freshly builds the exact selected `034fd65` source on Bookworm with Rust 1.97.1/Cargo --locked and passes 669 Linux units. It then installs the archive into a separate Node 22.23.3 Bookworm container with runtime/desktop packages and no Rust build. Source/regular-file/refusal owners pass on Bookworm; source, identity, checksums and original application effects are independently reviewed before release.

271 embedded SDK owners pass. Fresh ordinary-user TigerVNC/shared-bus application owners save exact 29-byte ASCII and 46-byte Unicode selected replacements, leave the payload clipboard, refuse missing foreground/clipboard grants, and report partial saved `par` as unknown after one dispatch. At the 500 ms typing deadline 52 codepoints are visible and the action remains active; completion saves 1,000 codepoints / 2,750 bytes before the following Save starts. A queued action is cancelled before dispatch. One SDK binds replacement PID 13964 after 13902 exits; old handles refuse before input, and one replacement paste saves 75 exact UTF-8bytes. The strict bridge retains its app across realm-await. Seven original supervisors, three new supervisors and three replacement-test children exit without force. [Compact evidence](linux-driver-distribution74.json).

The archive checksum is `b90923f16e2f8b53ec310ba4d12b7e05321fcb8bf04657aa6c5bf84c95063356`; executable checksum is `7ba6c7fb7cbe1e790a4005b2c089fa3b883d3f970e5ac8f058e5a7a85322b461`. All 766 internal file checksums round-trip independently. Source, Rust 1.97.1, Cargo.lock and ABI provenance accompany these exact bytes. The binary's highest observed GLIBC requirement is 2.35; supported qualification remains Bookworm / glibc 2.36.

No model agents are used in distribution qualification and it earns no benchmark
score. Sandboxed Chrome in the Bookworm container remains unqualified; this
release does not disable its sandbox or claim browser compatibility from native
app tests. The selected Mac source includes upstream in-process bundle plist reads; stable signing and permissions are retained. Its public SDK inventory median improves 446.75→33.08ms for the same 82 apps in this controlled read-only comparison ([evidence](mac-plist74.json)). Unresolved Mac cold-file launch issues remain; no whole-task gain is inferred.

Source builds remain supported: check out the exact `driver-source.json` commit
in `tanishqkancharla/cua`, then run `cargo build --release --locked -p cua-driver`
in `libs/cua-driver/rust`, setting `CUA_DRIVER_SOURCE_SHA` to that commit. Do not
substitute the upstream CUA executable. A fresh driver pin requires a new archive
qualification and release; existing assets must never be overwritten with
`--clobber`. Previously released SDKs may reuse an asset only when their exact
selected driver source matches.

## Maintainer contract

Qualify a candidate with `.github/workflows/linux-driver-release.yml` at an exact
SDK commit. Source preflight refuses mismatched SDK/driver pins before Cargo; the
archive qualification still rechecks the built identity and bytes. Independently
review the original native saved files, operation receipts and owned cleanup,
then publish the archive, provenance, asset manifest, SDK tarball and checksums
together. GitHub release immutability is enabled: stage all assets before
publication, verify the final release's `immutable` flag, and verify its signed
asset attestation with `gh release verify-asset TAG FILE`. Existing assets must
not be replaced. Refer to GitHub's [immutable release contract](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).
