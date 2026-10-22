## Current 0.2.41 archive

Driver `1e63ff2d7b0f0e5267cea2e216d5fa2cf0c537c4` (0.38.0). Archive SHA-256 `cf2cbd158f5a51615564324febe75698cddf72b0a0f48eab2ee4464bce142d69`; executable SHA-256 `88700b8f76b19dfc5c76d4ee8d7395fca3b953223d69155faaba7de982ae3eba`. [Current effects and limits](web-partial-typing89.md), [asset manifest](../driver-assets.json). Earlier release records below remain historical.

## Historical 0.2.40 archive

Driver `95b620a301c23af9da5f771c7c3f0a448a91590c` (0.38.0). Archive SHA-256 `4125ec84f6ae094086efd1a9f3ef18e37ad13779c85e5ef62484364fbc788d17`; executable SHA-256 `8062bf7b60de0cefb8d63acc5f7574621918dda88e9cdcf86f55c46a08625ab8`. [Current pins and application effects](driver038-qualification88.md), [asset manifest](../driver-assets.json). Earlier release records below remain historical.

## Historical 0.2.39 archive

Driver `4a9dc4da3225f7880c58b45a4be719e837954fe1`. Archive SHA-256 `0c22507dfd529318c50a2cd98f23a90efada7099f21341715727d9f56cf221cb`; executable SHA-256 `cbe7e0c1ba0f4ba74e1087cab5d6270886278a8dee2e70f0a0fb903d8e1fffb9`. [Current pins and effects](web-typing-safety87.md), [asset manifest](../driver-assets.json). The0.2.38 material below is historical.

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
ARG OPENSKY_DRIVER_URL=https://github.com/tanishqkancharla/opensky/releases/download/v0.2.38/opensky-driver-0.37.0-fb777b006e0c63d3e060c87ec31be7c580fc6155-linux-x86_64-gnu-bookworm.tar.gz
ARG OPENSKY_DRIVER_SHA256=b8fc2b75497b86fbe289690eedcdcc52245fd10fcc853f33d2a49216a7b2fb27
RUN curl -fSL "$OPENSKY_DRIVER_URL" -o /tmp/opensky-driver.tar.gz \
 && printf '%s  %s\n' "$OPENSKY_DRIVER_SHA256" /tmp/opensky-driver.tar.gz | sha256sum -c - \
 && mkdir -p /opt/opensky \
 && tar -xzf /tmp/opensky-driver.tar.gz --strip-components=1 -C /opt/opensky \
 && rm /tmp/opensky-driver.tar.gz
ENV OPENSKY_DRIVER_BINARY=/opt/opensky/opensky-driver
RUN /opt/opensky/opensky-driver --version \
 && /opt/opensky/opensky-driver --opensky-driver-identity > /opt/opensky/identity.json \
 && node -e 'const i=require("/opt/opensky/identity.json"); if(i.product!=="opensky-driver" || i.protocolVersion!==1 || i.version!=="0.37.0" || i.source!=="fb777b006e0c63d3e060c87ec31be7c580fc6155") process.exit(1)'

```

Keep the identity check: product `opensky-driver`, protocolVersion `1`, version
`0.37.0`, source `fb777b006e0c63d3e060c87ec31be7c580fc6155`. The SDK still verifies
fork product/protocol compatibility; Halo must keep its exact-source check above.
The archive preserves daemon ownership, grants,
action completion/drain, clipboard or foreground semantics. Install files as
root or another trusted owner; run the driver as the ordinary desktop user.
A binary path override selects this executable; it does not grant permissions.

## Verification and limitations

[Qualification39542863439](https://github.com/tanishqkancharla/opensky/actions/runs/39542863439) freshly builds the exact driver and qualifies a separate clean Node 22 Bookworm consumer without Rust. 671 Linux units, 3 TLS and 275 embedded SDK owners pass. Exact native paste, partial-delivery unknown status, timeout followed by completion/drain and ordered Save, queued cancellation, strict bridge, replacement-process binding, relative capture and GTK4 foreground effects verify. All 7+3+4 supervisors and 3 replacement children exit unforced. [Actual effects and limitations](driver037-qualification83.md), [structured evidence](linux-driver-distribution83.json).

The relative-storage owner captures an exact640×480 editor PNG from relative SDK home/screenshot paths under the existing bounded file grant. Original driver-output bytes match, while focus, text and clipboard remain unchanged.

The archive checksum is `b8fc2b75497b86fbe289690eedcdcc52245fd10fcc853f33d2a49216a7b2fb27`; executable checksum is `fdf1f15bdb61a970e26fef2d4b91fd5a1ce59629faa4fb3d6ca92ddf35f80892`. All internal file checksums round-trip independently. Source, Rust 1.97.1, Cargo.lock and ABI provenance accompany these exact bytes. The binary's highest observed GLIBC requirement is 2.35; supported qualification remains Bookworm / glibc 2.36.

No model agents are used in distribution qualification and it earns no benchmark
score. Sandboxed Chrome in the Bookworm container remains unqualified; this
release does not disable its sandbox or claim browser compatibility from native
app tests. The selected Mac source excludes the hardware pointer from native single-window captures. The actual signed SDK before/after comparison restores full image content when the pointer sits above the target, retaining the same reported dimensions and exact-target checks ([original PNGs and evidence](window-capture75.md)). Stable signing/permissions are retained. Earlier in-process bundle plist reads remain unchanged; historical latency measurements on source `034fd65` are retained separately in [Mac inventory evidence](mac-plist74.json). Unresolved Mac cold-file issues remain; no whole-task gain is inferred.

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

The selected driver also confirms the exact focused/main window before background menu dispatch and preserves target-safety hotkey refusals. Its 150-second Unix Rust transport reply budget uses nonblocking poll to preserve a buffered reply after a Unix peer closes, including Darwin. Explicit TypeScript client deadlines and unknown-delivery/no-replay semantics remain unchanged. See [native and transport evidence](native-menu-transport76.md).

The selected Mac resolver also accepts an existing absolute `.app` path returned by `list_apps` as `launch_app.name`, including a trailing slash. Cold Calculator launch and exact-window pixels verify; this preserves bundle-id precedence and does not close the intermittent file-launch issues. See [Mac path evidence and SDK example](mac-app-path78.json).

The integrated driver reports 0.37.0 and preserves the later Rust TLS distrust dependencies. [Current driver qualification](driver037-qualification83.md); [historical TLS evidence](tls-distrust81.json).
