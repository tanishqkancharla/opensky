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
ARG OPENSKY_DRIVER_URL=https://github.com/tanishqkancharla/opensky/releases/download/v0.2.31/opensky-driver-0.36.0-9e9219a0ca84ea195b9cf3be35b42a6379699448-linux-x86_64-gnu-bookworm.tar.gz
ARG OPENSKY_DRIVER_SHA256=92b7f95d4b266981be4e294d36763ac928d2f29ac3fd4d94ff009e8d98261b23
RUN curl -fSL "$OPENSKY_DRIVER_URL" -o /tmp/opensky-driver.tar.gz \
 && printf '%s  %s\n' "$OPENSKY_DRIVER_SHA256" /tmp/opensky-driver.tar.gz | sha256sum -c - \
 && mkdir -p /opt/opensky \
 && tar -xzf /tmp/opensky-driver.tar.gz --strip-components=1 -C /opt/opensky \
 && rm /tmp/opensky-driver.tar.gz
ENV OPENSKY_DRIVER_BINARY=/opt/opensky/opensky-driver
RUN /opt/opensky/opensky-driver --version \
 && /opt/opensky/opensky-driver --opensky-driver-identity > /opt/opensky/identity.json \
 && node -e 'const i=require("/opt/opensky/identity.json"); if(i.product!=="opensky-driver" || i.protocolVersion!==1 || i.version!=="0.36.0" || i.source!=="9e9219a0ca84ea195b9cf3be35b42a6379699448") process.exit(1)'

```

Keep the identity check: product `opensky-driver`, protocolVersion `1`, version
`0.36.0`, source `9e9219a0ca84ea195b9cf3be35b42a6379699448`. The SDK still verifies
fork product/protocol compatibility; Halo must keep its exact-source check above.
The archive preserves daemon ownership, grants,
action completion/drain, clipboard or foreground semantics. Install files as
root or another trusted owner; run the driver as the ordinary desktop user.
A binary path override selects this executable; it does not grant permissions.

## Verification and limitations

[Qualification39195336821](https://github.com/tanishqkancharla/opensky/actions/runs/39195336821) installs the exact archive into a separate Node 22.23.3 Bookworm container with runtime/desktop packages and no Rust build. The archive is a hash-verified first-party build from 39194227474: that original run passed 669 Linux units but failed the newer Python tarfile API before consumer tests. The corrected extractor passes source/regular-file/refusal owners on Bookworm; no original failure is reclassified as application acceptance.

271 embedded SDK owners pass. Fresh ordinary-user TigerVNC/shared-bus application owners save exact 29-byte ASCII and 46-byte Unicode selected replacements, leave the payload clipboard, refuse missing foreground/clipboard grants, and report partial saved `par` as unknown after one dispatch. At the 500 ms typing deadline 52 codepoints are visible and the action remains active; completion saves 1,000 codepoints / 2,750 bytes before the following Save starts. A queued action is cancelled before dispatch. One SDK binds replacement PID 13638 after 13576 exits; old handles refuse before input, and one replacement paste saves 75 exact UTF-8bytes. The strict bridge retains its app across realm-await. Seven original supervisors, three new supervisors and three replacement-test children exit without force. [Compact evidence](linux-driver-distribution73.json).

The archive checksum is `92b7f95d4b266981be4e294d36763ac928d2f29ac3fd4d94ff009e8d98261b23`; executable checksum is `a55b7e50b5f579f4d4c0648e2e484d526e6a3c85447b492113ac8f433bf2611a`. All 766 internal file checksums round-trip independently. Source, Rust 1.97.1, Cargo.lock and ABI provenance accompany these exact bytes. The binary's highest observed GLIBC requirement is 2.35; supported qualification remains Bookworm / glibc 2.36.

No model agents are used in distribution qualification and it earns no benchmark
score. Sandboxed Chrome in the Bookworm container remains unqualified; this
release does not disable its sandbox or claim browser compatibility from native
app tests. Mac source/signing/permissions and the unresolved cold-file launch
issues are unchanged.

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
