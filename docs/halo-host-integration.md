## Current tested distribution: SDK 0.2.45 / Driver 0.38.0

Driver `096490a1721a4fe693623531f9ba0cf5e20806d0`; qualified SDK `e79e1ebbcc16b4ca3871e4a0a10ec02ed3148dca`. [Exact native calls, evidence and limits](gtk4-entry96.md). Bookworm run40045288833 verifies native paste, timeout/Stop/drain, queued cancellation, rebind, GTK4 keyboard and capture-bound foreground pixel entry, consumed-capture/stale-reference refusals and cleanup with bounded grants. GTK4 semantic entry focus remains unconfirmed/open #76; sandboxed Bookworm Chrome remains unqualified. The persistent-host lifecycle API below is unchanged.

## Historical tested distribution: SDK 0.2.44 / Driver 0.38.0

Driver `13505413d11c40cc91092df5c0bcb7e2cfc3e289`; qualified SDK `6443595604624c73cb5b395a8e89fda0f9db5aca`. [Current application evidence and limits](upstream-mac-maintenance94.md), [current native receipts](halo-current-native-evidence.json), [installation](linux-driver-distribution.md). Bookworm run39949487173 verifies native paste, timeout/Stop/drain, queued cancellation, replacement binding, GTK4 foreground input and relative capture with explicit bounded grants. Sandboxed Bookworm Chrome remains unqualified. Historical reports retain their original pins.

## Historical tested distribution: SDK 0.2.43 / Driver 0.38.0

Driver `9efa30f02189b33f2b09370e9cc0daaab25972ea`; qualified SDK `6fbe949cce9c6c007d18da4297dcb8373bc27778`. [Current application evidence and limits](native-partial-typing93.md), [current native receipts](halo-current-native-evidence.json), [installation](linux-driver-distribution.md). Bookworm run39897260360 verifies native paste, timeout/Stop/drain, queued cancellation, replacement binding, GTK4 foreground input and relative capture with explicit bounded grants. Sandboxed Bookworm Chrome remains unqualified. Historical reports retain their original pins.

## Historical tested distribution: SDK 0.2.42 / Driver 0.38.0

Driver `2947bad8071540f3dc53fa44ec586a6735bb528a`; qualified SDK `303da7c6ac83c103d19aff89e49cc3c61d991f63`. [Current application evidence and limits](native-ax-replay92.md), [current native receipts](halo-current-native-evidence.json), [installation](linux-driver-distribution.md). Bookworm run39845132948 verifies native paste, timeout/Stop/drain, queued cancellation, replacement binding, GTK4 foreground input and relative capture with explicit bounded grants. Sandboxed Bookworm Chrome remains unqualified. Historical reports retain their original pins.

## Historical tested distribution: SDK 0.2.41 / Driver 0.38.0

Driver `1e63ff2d7b0f0e5267cea2e216d5fa2cf0c537c4`; qualified SDK `b098847cbfc36914c54bc61b063aa03003e59d43`. [Current application evidence and limits](web-partial-typing89.md), [current native receipts](halo-current-native-evidence.json), [installation](linux-driver-distribution.md). Bookworm run39719016542 verifies native paste, timeout/Stop/drain, queued cancellation, replacement binding, GTK4 foreground input and relative capture with explicit bounded grants. Sandboxed Bookworm Chrome remains unqualified. Historical reports below retain their original pins.

## Historical tested distribution: SDK 0.2.40 / Driver 0.38.0

Exact driver `95b620a301c23af9da5f771c7c3f0a448a91590c`; qualified SDK runtime `ce39bd064bc8b3ed9d078823a298300d64342088`. [Current source pins and application evidence](driver038-qualification88.md), [current native contract results](halo-current-native-evidence.json), and [binary installation](linux-driver-distribution.md). Fresh Bookworm run 39664557670 verifies native paste, selected replacement, queued cancellation, completion/drain after timeout, process rebind, relative capture and GTK4 foreground input with explicit bounded grants. Sandboxed Bookworm browser acceptance remains unqualified. Historical version-specific reports below do not override these pins. The public host API and lifecycle examples remain applicable.

## Linux binary distribution in0.2.31

[The SDK release](https://github.com/tanishqkancharla/opensky/releases/tag/v0.2.31)
includes a Linux amd64 Bookworm archive for the unchanged9e/0.36.0 driver pin,
with source/toolchain/ABI provenance, checksums and exported `driver-assets.json`.
[Installation and exact-source checks](linux-driver-distribution.md) let Halo
remove its Rust compilation stage. Fresh clean-consumer39195336821 verifies the
same native, strict, Stop/drain and process-rebind effects with the extracted
binary and bounded grants. [Exact evidence](linux-driver-distribution73.json).
This changes distribution/metadata only; the TypeScript operation runtime stays
452bc21/0.2.30. Sandboxed Bookworm Chrome and Mac cold-file19/66 remain unqualified.

# Persistent Linux host integration

## Historical tested distribution: SDK0.2.30 / Driver0.36.0

Fresh `cua.getApp(name)` discovers the current native process into a separate
binding after restart. Retained handles keep their original process and refuse
stale input; ambiguous namesakes still refuse. Direct SDK callers use
`get_app_state({app: name, scope: "app", includeScreenshot: false})` for fresh
binding. Runtime source is **`452bc212706c0e33edb5b214c56b4179971995a7`**;
driver remains **`9e9219a0ca84ea195b9cf3be35b42a6379699448`**.

[Bookworm38981264234](https://github.com/tanishqkancharla/opensky/actions/runs/38981264234)
verifies actual GTK stop/start under one SDK/facade: PID30626 exits; fresh lookup
binds30689, even with reused XID6291459. Retained read/paste refuse before input;
one replacement paste saves the exact75UTF-8bytes, with the documented payload-left
clipboard. Three owned children and three desktop supervisors exit unforced.
The separate grant names only canonical Python executable windows, display,
clipboard text write and listed tools; launch/termination permissions are denied.
Original PID/window-only native, strict bridge and Stop/drain contracts also pass:
516whole SDK/two skips,269embedded,669fresh Linux units/ten ignored and seven
original supervisors exiting without force. Local Node22/24 each pass517/one Bun
skip; real Mac restart and existing Calculator click/diff checks pass.
[Exact scope and evidence](native-app-rebind72.json).

Install the [GitHub tarball](https://github.com/tanishqkancharla/opensky/releases/tag/v0.2.30).
Mac cold-file launch19/66 and sandboxed Bookworm Chrome remain unqualified.
No npm registry publication or paid benchmark improvement is claimed.

## Previous tested distribution: SDK0.2.29 / Driver0.36.0

SDK runtime **`cb13ce95b535fcc3a166e478ce75c4d1055954b5`** adds a typed,
actionable refusal for unsafe Node promise tracking in the optional strict
AsyncRepl. See [host instrumentation semantics](#host-instrumentation-refusal-sdk0229)
and [exact before/after evidence](strict-runtime-56-refusal.json). The driver
stays at **`9e9219a0ca84ea195b9cf3be35b42a6379699448`**. Install the attached
[GitHub tarball](https://github.com/tanishqkancharla/opensky/releases/tag/v0.2.29);
no npm registry publication is claimed. All72 installed compiled files match
the qualified runtime; twelve installed Node22/24 process probes pass.

[Bookworm38939166394](https://github.com/tanishqkancharla/opensky/actions/runs/38939166394)
passes the real strict CUA bridge, retained app across realm await, original
artifact attribution, saved ASCII/Unicode, uncertain partial paste/no replay,
Stop/drain and following Save ordering. At500ms52codepoints are visible;
all1000/2750UTF-8bytes eventually save. Whole SDK514pass/two skips,
269embedded contracts and669Linux units/ten ignored pass; all seven supervisors
exit without force. It uses the same explicit grants and native environment
below. **Sandboxed Bookworm Chrome remains unverified.**

[Ubuntu22host38939170188](https://github.com/tanishqkancharla/opensky/actions/runs/38939170188)
passes strict/native effects plus a trusted click,600px trusted wheel, exact
owned foreground PID, stale/missing-opt-in refusals and five kernel-sandboxed
renderers. Driver bytes/669-unit log are reused from38920063943 by independent
source/hash verification;269embedded and all desktop effects run freshly.
All seven supervisors exit without force; sandbox and namespace/LSM policy are
unchanged. Local Node22/24 each pass515SDK tests/one Bun skip. Two read-only
Mac strict cells preserve the original Calendar window. Mac cold-launch issues
19/66 remain open; no new paired score or full desktop parity is claimed.

## Previous Bookworm native-only verification

[Fresh run38934464996](https://github.com/tanishqkancharla/opensky/actions/runs/38934464996)
builds supported driver9e/0.36 from SDK43098d4/0.2.28 on Node22.23.3 in an
ordinary-user Debian Bookworm container, TigerVNC:1, XFWM4 and shared D-Bus/AT-SPI.
Exact saved ASCII/Unicode selection replacement, payload-left clipboard behavior,
partial unknown paste with one dispatch/no replay, and Stop/drain all pass.
At500ms53/1000 codepoints are visible; all1000/2750UTF-8bytes eventually save,
queued input is cancelled and the following Save starts after completion.
The strict realm-await/artifact-ownership owner passes, as do508whole SDK tests
(two skips),269embedded owners and669Linux units (ten ignored desktop cases).
All seven owned supervisors exit without force. See [exact pins, hashes and
scope](bookworm-native036.json); the existing runnable host examples below apply.

Tested desktop packages include TigerVNC1.12.0, XFWM4.18.0, D-Bus1.14.10 and
AT-SPI2.46.0. The explicit version3 grant manifest names only the owned editor
PID/window, display access, plaintext clipboard write and a nonrecursive screenshot
output directory. Clipboard read remains denied despite the tool name being
listed. Host/session lifecycle and active-stop limitations below are unchanged.

[Separate sandbox probe38934689420](https://github.com/tanishqkancharla/opensky/actions/runs/38934689420)
fails: Chrome155.0.8059.84 under docker-default/enforced AppArmor on kernel
6.17.0-1022-azure cannot create any of the four probed namespaces (EPERM).
No policy is changed and the probe is reaped. **Sandboxed Bookworm browser
compatibility remains unverified**; Ubuntu22 host browser evidence is separate.
Native success does not certify browser input or persistence across host restarts.
The Bookworm binary hash is recorded by CI; its binary was not exported/rehashed
locally for reuse.

## Previous tested distribution: SDK0.2.28 / Driver0.36.0

The driver pin advances to **`9e9219a0ca84ea195b9cf3be35b42a6379699448`**, the
canonical0.36.0 history plus retained OpenSky exact-target, permission, native
paste and uncertain-delivery contracts. SDK application code is unchanged from
0.2.27: all72 compiled files are byte-identical. Whole SDK509pass/1Bun-only
skip each on Node22/24, build and E2E typecheck pass. Final signed-Mac9e passes
all29 required contracts across18groups, with exact cleanup and existing grants.
Installed tarball smokes pass on Node22/24 with zero desktop inputs. Install the
attached GitHub release tarball; no npm registry publication is claimed.

[Whole Linux regression38920060955](https://github.com/tanishqkancharla/cua/actions/runs/38920060955)
and [fresh host contract38920063943](https://github.com/tanishqkancharla/opensky/actions/runs/38920063943)
pass. The sixteen actual X11 keyboard owners include delayed foreground and
background consumers: an original NUL-prefix regression after a missed ping now
retains the exact é prefix, returns unknown delivery, and never replays input or
sends the remaining batch. All669 Linux library unit tests pass with10 desktop
cases ignored in that separate unit command.

The bounded-grant Ubuntu22 host/Node22/TigerVNC/shared-bus run freshly rebuilds
the driver and verifies exact saved ASCII/Unicode replacements, one uncertain
partial paste,51 codepoints at500ms then all1000 saved, queued cancellation and
following Save serialization. One trusted browser click and600px trusted wheel
scroll, exact foreground PID, missing-opt-in/stale refusals, and five owned
kernel-sandboxed renderers pass. All seven supervisors exit without force.
Chrome's sandbox and host namespace/LSM policy remain unchanged. **The exact
Bookworm container browser remains unqualified.** Required packages, grants,
clipboard behavior and lifecycle examples below still apply.

The final signed-Mac0.36 source9e passes all29 required contracts across18groups
with exact cleanup. The Mac signing
identity, bundle identifier and existing AX/Screen Recording grants are preserved.
This upgrade does not claim a new paid benchmark score.
[Exact driver/runtime application evidence](driver036-evidence.json).

The actual `browser_prepare` response declares isolated-browser ownership by the
session, process termination with the session, a temporary profile, and an idle
expiry of300seconds. Keep the SDK/host session at workspace scope and revalidate
tabs after idle periods. The metadata/session cleanup is verified here; a
wall-clock300second expiry was not tested. Grant-manifest expiry below is a
separate authorization lifetime.

## Previous tested distribution: SDK0.2.27 / Driver0.35.4

SDK0.2.27 retains driver pin **`4a0189e286cf48c6b05da5bdd76ffebce4accc84`**.
Accepted SDK runtime source is **`d7034226852823a2a9dd26eb962e6a67b62c870e`**.
Use the GitHub release tarball; no new npm registry publication is claimed.

Native `cua.getApp("python3")` now resolves the sole attested GUI process among
same-name headless processes before probing windows. Existing identifier
precedence, exact target/stale checks and metadata-only cold launch remain.
Multiple live GUI processes or unproved live identity refuse with
`ambiguous_app` and `error.details.delivery === "not_dispatched"`; no input is
sent. Use an unambiguous app identifier or exact PID/window driver calls when
several GUI processes share one name. Keep all host mutations in the shared
`DesktopActionQueue` described below; no action is automatically replayed.

[Actual run38905764063](https://github.com/tanishqkancharla/opensky/actions/runs/38905764063)
on an ordinary-user **Ubuntu22 host**, Node22.23.3, TigerVNC/XFWM and shared
D-Bus/AT-SPI verifies both the strict-worker binding and direct SDK, under
unchanged bounded grants. Exact saved ASCII/Unicode replacements, payload-left
clipboard, typed pre-input refusals, one partial paste with unknown effect/no
replay, queued cancellation and eventual1000-codepoint/2750-byte saved typing
all pass.44codepoints are visible at the500ms deadline; Stop leaves that action
active and following Save starts only after completion. Seven supervisors exit
without force. [Compact native effect evidence](native-app-027-evidence.json).

### Sandboxed foreground browser qualification after release

[Full run38913108850](https://github.com/tanishqkancharla/opensky/actions/runs/38913108850)
**passes** at qualification harness90bb0b40e17c29d1e3ae9db78c9a8e93c5e0bd36,
with the same published SDK0.2.27 runtime and driver4a0189e. On Ubuntu22 host,
Node22.23.3, Google Chrome155.0.8059.84, TigerVNC/XFWM/shared D-Bus, an ordinary
uid1001 with zero effective capabilities performs one trusted click and a
trusted wheel scroll of600pixels. The page has focus and the active native
window PID equals the driver-owned Chrome root. Missing foreground opt-in
preserves editor focus/zero clicks; a stale screenshot refuses without a second
click. Before/after screenshots show the button scrolled out of the viewport.
Five stable owned renderer processes have NoNewPrivs1, Seccomp2 and an additional
filter beyond the host baseline. No sandbox-disabling flags are supplied.
[Compact full application evidence](halo-browser-host-027-evidence.json).

Required browser origins explicitly include `about:blank` for the fresh isolated
tab bootstrap, then each intended destination origin; the fixture grants only
that bootstrap and `http://127.0.0.1:8123`. It grants only isolated profiles and
the root-managed Chrome executable/window/lifecycle operations listed in
[e2e/halo/session.sh](../e2e/halo/session.sh). The CI image's root-owned Chrome
ancestor directories were mode777: provisioning removes group/other write bits
from `/opt`, `/opt/google`, `/opt/google/chrome` rather than weakening driver
trust checks. Chrome's sandbox and host namespace/LSM policy are unchanged.

The exact driver binary and its666-unit log were reused from original
run38908929381 with source, identity and both byte hashes checked before install.
Those driver units were not rerun in the final job;269 embedded SDK owners and
all native/browser application outcomes execute afresh. The default workflow
builds the driver; explicit `reuse_driver` refuses source/hash mismatches.

**Ubuntu host acceptance does not establish Halo's Bookworm container browser
compatibility.** Bookworm native-only evidence remains separately pinned below;
its container's Chrome namespace policy is still unqualified here. The earlier
host failures (desktop readiness, protected headless namesake, writable Chrome
ancestors, missing blank origin and flattened process-title oracle) remain
retained. They are not relabeled as successful whole runs.

Whole SDK506pass/1Bun-only skip each Node22/24;269 embedded owners and666Linux
units pass. All29 required signed-Mac owners pass across18groups. A first
competing-copy watcher identity refusal is retained; its exact paste saved and
cleanup passed, then an unchanged fresh fixture retry passes. Final SDKd703 only
adds the guarded metadata-only cold compatibility branch to the real-Mac tested
652source; the successful GUI paths are unchanged. Signing identity/grants stay
unchanged. This release claims no new benchmark performance gain.


## Previous tested distribution: SDK0.2.26 / Driver0.35.4

SDK0.2.26 pins driver **`4a0189e286cf48c6b05da5bdd76ffebce4accc84`**. Its
accepted SDK source is **`6201d3fdd5e00e056e0d60ffa6c552e15966e73a`**; the
release changes documentation/version metadata and preserves all72 compiled SDK
runtime files. Install the declared GitHub release tarball; registry0.1.2 is older.

[Native application run38889721645](https://github.com/tanishqkancharla/opensky/actions/runs/38889721645)
verifies Bookworm/Node22.23.3, TigerVNC/X11, XFWM4 and shared D-Bus/AT-SPI with
explicit bounded grants. Exact ASCII/Unicode selected replacements save correctly
and leave the clipboard payload. The partial-paste owner saves only `par` and
returns `native_paste_unverified` with unknown effect and one dispatch. At the
500ms typing wait deadline43 of1000 Unicode characters are visible; Stop keeps the
action active, all1000/2750 UTF-8 bytes eventually save, and the following Save
starts after completion. Queued cancelled input does not run. All seven owned
supervisor processes exit without force. [Saved-file evidence](halo-026-native-evidence.json).

The shared daemon authorization boundary now preserves a structured error before
registry/platform dispatch:

```json
{"status":"refused","refusal":{"code":"permission_denied","message":"Permission denied: …"},"delivery":"not_dispatched"}
```

CLI exit is nonzero; the request is terminal. The host queue reports `failed`,
runs the following authorized callback and drains normally. Policy loading and
evaluation at that boundary use `policy_loading_error` and
`policy_evaluation_error`, with the same non-dispatch guarantee. No code or
completion proof is inferred from stderr. Timeouts/disconnects retain the existing
unknown-completion fence and no-replay contract. Continue using the runnable host,
paste and foreground browser examples below. [Admission/queue evidence](driver-admission-026.json).

Full browser mode keeps a browser-only manifest and expects typed native-tool
denial before clipboard access; native-only mode retains its exact missing
clipboard-resource refusal. Manifests are not widened. The real Mac policy/queue
probe,29 current Mac GUI owners, whole SDK Node22/24 suites and all five selected
driver CI workflows pass. **Sandboxed TigerVNC Chrome remains unverified**; the
new Linux application run explicitly records browser `not_run` and is not full
production compatibility. No sandbox bypass, privileged container or uinput grant
was used. Older evidence below retains its original pins and scope.

## Previous0.2.24–0.2.25 X11 paste distribution

The native-only [application run38875586155](https://github.com/tanishqkancharla/opensky/actions/runs/38875586155) verifies SDK **`d14db52b22e63528b335f1ebdc71c02a094cd9dc`** with driver **`c36e63ef8e7387cd827596169396b63cbfe68f30`** (driver version0.35.4). SDK0.2.24 packages this same verified runtime and exact driver pin. SDK0.2.25 retains that input contract and driver pin while compacting Mac observation metadata; its new real-application verification is on Mac. The0.2.23 package predates Linux native paste support. Documentation-only successors do not change that tested runtime. [Compact application evidence](halo-x11-native-paste-evidence.json).

On ordinary uid1001, Bookworm, Node22.23.3, TigerVNC/X11 and a shared D-Bus/AT-SPI session, public `app.paste` saves exact ASCII and Unicode selected replacements. The clipboard is left with the payload. A private GTK handler accepting only three characters produces saved `par`; the SDK reports unknown effect after the host500ms wait deadline and Stop request, with one dispatch and no replay. Missing foreground and missing clipboard resources refuse before mutation; clipboard write does not grant clipboard read. All seven owned supervisor processes exit without forced termination.266 required embedded SDK owners,503 whole Node22 owners and666 Linux units pass; these are separate from application evidence.

The original1000-character Unicode typing owner remains:41 characters are visible at the500ms wait deadline; the action remains active after Stop, finishes in13.781seconds and saves all1000 characters before the following Save starts. Queued cancelled input never dispatches. This is a completion/drain contract, not hard cancellation. Sandboxed Chrome is explicitly not run and remains unverified.

## Previous release pins and verification boundary

The earlier verified distribution is **SDK0.2.20**, with Driver **0.35.4**,
runtime source **`6647fa8d7f5edc0337d0d616f00c202df68b9bc4`**.
That historical [native acceptance run](halo-0220-native-evidence.json) uses
SDK`d645423b29f3e0b5106e22d95db53ddd509c17f9`; the final distribution has the
same TypeScript SDK runtime, with updated release metadata and verification docs.
This run verifies actual saved Unicode, cancellation/drain, actionable paste
refusal and strict bridging on unprivileged Bookworm/TigerVNC with bounded grants.

Background XSendEvent Unicode now uses the existing per-character acknowledgement
barrier for the exact receiving client. The separate
[isolated X11 owner](linux-background-unicode-67.json) verifies delayed delivery,
unknown-effect stopping, focus preservation and keymap restoration on both paths.
Foreground XTest, the TypeScript host queue, Linux paste refusal and grants retain
their public contract. The current [Mac owners](mac-driver-0220-evidence.json)
preserve stable signing and existing permissions.

[Previous native acceptance](halo-0354-native-evidence.json) remains its own
SDKcffb21e/Driveraee4fd3 record. The older compositor-off/on capture matrix used
SDKf1b687b7/Driver0.35.2 source34f3d150. Those records do not establish current
sandboxed Chrome acceptance, which remains unverified.
Driver1007552b additionally fixes operator `status --pid-file` selection.
Its isolated CLI-daemon checks are separate from Halo's embedded SDK/native
acceptance; status PID-file text is not authenticated ownership or action completion.
[Operator contract evidence](driver-status-pid-60.json).

### Read-only status for the selected daemon

Drivera164e38e also fixes `permissionStatus()` selecting the wrong daemon: the
SDK already passed its explicit `socket`, but previous driver CLI dispatch ignored
it. With the current pin, an unavailable selected endpoint returns
`{daemon_running:false,status:"unknown",reason:...}` without grant booleans or
fallback. A live Linux daemon reports native fields including `x11` and `atspi`;
Windows reports integrity/UIA; macOS retains responsible-process TCC filtering.
Unknown status is not a denial or permission to send input. Status is not proof
of action completion or successful browser/native capture.

```js
import {OpenSkyDriverClient} from "opensky-cua";
const driver = new OpenSkyDriverClient({
  binaryPath: "/absolute/path/to/opensky-driver",
  socket: "/absolute/path/to/owned-daemon.sock",
  autoStart: false,
  autoInstall: false,
});
console.log(await driver.permissionStatus()); // read-only; does not start a daemon
```

Start/configure the persistent daemon separately in the host's DISPLAY and shared
D-Bus session. The Linux/Windows tool schemas accept the SDK's existing
`prompt:false` request. No new OS or action grants are added. The existing shared
authorization refusal for agent `prompt:true` remains. `permissions grant --socket`
(and `grantPermissions()` on a socket-configured client) exits64 before any UI:
that grant command configures the installed Mac app, while embedded hosts own
their setup. Callers of `grantPermissions()` must inspect its returned exit code.

Actual signed Mac SDK/CLI default/private/missing endpoint checks and the public
expected-PID private-daemon Stop pass with zero input; socket/PID files are removed.
The native Linux permission-owner and schema-removal/restoration steps passed;
Windows and the complete workflow remain pending in
[driver run38759816438](https://github.com/tanishqkancharla/cua/actions/runs/38759816438)
at this revision. This is not new TigerVNC/Chrome or GUI acceptance.
[Compact permission-status evidence](driver-permissions-61.json).

Registry `opensky-cua@0.1.2` does not identify these features. Use an immutable
built checkout or the declared GitHub release tarball; record the selected
binary's `--opensky-driver-identity` and avoid pairing it with another daemon.

[Historical native application run38838190369](https://github.com/tanishqkancharla/opensky/actions/runs/38838190369)
used Node22.23.3 in Debian Bookworm, TigerVNC/X11, XFWM4, real AT-SPI,
uid1001 and two explicit bounded manifests on one shared session D-Bus.
[Compact before/after evidence](halo-0220-native-evidence.json):

| Check | Application evidence |
|---|---|
| 500ms host wait deadline and active Stop | 42 of1000 Unicode codepoints visible; action stayed active with stopRequested=true |
| Completion and serialization | typing finished after16.894s; exactly1000 codepoints/2750 UTF-8 bytes saved; following Save began at typing completion |
| Queued Stop | cancelled callback did not dispatch; MUST-NOT-APPEAR absent from the saved file |
| ASCII and Unicode native paste | unsupported_native_paste; exact text, selection and clipboard unchanged; saved document remains `replace me` |
| Cleanup | both SDK domains detached; all seven owned supervisor processes exited without forced termination |

This explicitly native-only run passes all265 required embedded SDK owners,
500 whole SDK owners with two skips on Linux Node22, and664 Linux platform units.
Local Node22/24 whole suites each pass501 with one Bun-only skip. The strict
bridge retains an exact app handle across a realm await and preserves artifact
ownership. The external legacy-hook limitation in issue56 remains open.
[Earlier native evidence](halo-current-native-evidence.json) and
[the prior capture/strict matrix](https://github.com/tanishqkancharla/opensky/actions/runs/38481237185)
remain historical; neither is replaced by a browser-acceptance claim.

**Sandboxed browser GUI acceptance remains unverified.** Earlier real Chrome probes
kept the sandbox enabled, but the hosted container denied namespace creation with
`Operation not permitted` before an owned SDK browser tab opens. No trusted
click/scroll, focus change, default-route refusal or renderer sandbox assertion
earns runtime acceptance. No privileged mode, `/dev/uinput`, or sandbox bypass
was used. This is an environment limitation, not evidence that Halo's sandboxed
Chrome fails. Those full-browser attempts remain failed. The new native-only lane explicitly
records browser status as `not_run`; its green result does not certify Chrome.

The original native acceptance at SDK`acd09e61889797f7f79bd53fe9ae9aeb25f29c82` /
Driver0.34.1`dd5f9f539289f88b942939d0ee077f8c1d2899cd` remains historical evidence
in [run38179361234](https://github.com/tanishqkancharla/opensky/actions/runs/38179361234).
Its feature branches have since merged; they are no longer draft-only contracts.

Reproduce native effects via `linux-benchmark-preflight.yml` with
`halo_native=true` at the explicit source pin. Use `halo_contract=true` for
the full sandboxed browser contract; its sandbox prerequisite remains mandatory. `e2e/halo/` retains full AX, saved files, manifests,
identity/package receipts and original logs as `halo-bookworm-contract`.
A missing browser result or passing unit suite does not establish production
Chrome compatibility.

## Ownership and cancellation contract

One persistent Node host owns one queue for the shared desktop. Every worker
and extension routes all conflicting desktop operations through that queue.
QuickJS gets serialized results and opaque action IDs; it never owns the SDK,
Cua objects, Node promises or daemon. Terminating a worker is not daemon Stop.

```js
import { createOpenSkyHost } from 'opensky-cua';
const host = createOpenSkyHost({
  target: 'linux', homeDir: '/home/halo/.opensky', session: 'halo-desktop',
  driverOptions: {
    binaryPath: '/opt/opensky/opensky-driver',
    socket: '/run/user/1001/opensky.sock', autoStart: false,
  },
});
const stop = new AbortController();
const action = host.submit(async ({ cua }) => {
  const app = await cua.getApp('Mousepad');
  await app.typeText('Hello');
  await app.pressKey('ctrl+s');
  return await app.getAXState({ emit: false });
}, { signal: stop.signal, label: 'edit document' });
const actionId = action.id; // return this to the worker before awaiting
try { await host.wait(actionId, { timeoutMs: 500 }); }
catch (error) {
  if (error.code !== 'desktop_wait_timeout') throw error;
  console.log(host.query(actionId)); // typically active; input may continue
}
stop.abort(); // queued => cancelled; active => stopRequested, still active
const snapshot = host.query(actionId);
if (snapshot.state !== 'cancelled') await host.wait(actionId);
await host.drain(); // then application postconditions, if required
// Worker Stop never calls host.close(). The server calls it at shutdown.
await host.close();
```

`submit` returns immediately. Each callback must await **all** of its SDK work;
fire-and-forget calls escape the queue contract. Propagate driver errors out of
the callback: catching an uncertain transport error and returning success also
escapes the contract. Catch/serialize errors outside `action.wait()` in the
host tool adapter. Later callbacks stay queued
until the current callback settles. Queue cancellation prevents the callback
from executing. Active cancellation is a stop request only: **no hard cancel**,
no rollback, no replay of uncertain input. Abort/deadline on `wait` only detaches
that waiter; the original request and result remain owned by the host. Multiple
waiters can use the same ID. The host's underlying input transport has no client
operation deadline; lifecycle readiness checks still have bounded deadlines.
Do not configure a 500ms driver timeout for this host. The pinned driver
still has a 120-second Unix socket response deadline internally; exceeding
that deadline loses completion proof and fences admission. The host API does
not remove driver-level transport limits.

| State | Meaning | Conflicting admission |
|---|---|---|
| queued | Callback has not executed | waits |
| cancelled | Cancelled before callback dispatch | safe |
| active | Callback/input can still be executing; `stopRequested` is informational | waits |
| completed | Callback fulfilled and all awaited driver calls returned | next callback may execute |
| failed | Callback rejected without transport uncertainty | next callback may execute; inspect effects |
| unknown | Transport completion proof lost | queue permanently fenced |

`query(id)` is immediate; `wait(id)` retains the original value/error;
`drain()` waits for all admitted work. `close()` stops admission, cancels queued
work, waits for active work and detaches owned SDK sessions. It does not stop a
shared daemon. `forget(id)` frees retained terminal actions; queued, active and
unknown actions cannot be forgotten. Applications may process input events or
save asynchronously after a tool reply: include the needed visible/saved
postcondition in the callback if it must precede other work. Completion never
proves saved content, clipboard rollback, or application success by itself.

Transport timeout/socket loss yields `unknown`, no completion `endedAt`, and
`desktop_completion_unknown` from drain. There is no automatic fence reset.
A daemon restart, host crash or bypass client cannot be reconciled by this
process-local queue: there is **no daemon action-ID/completion lookup** in this
candidate. Keep admission stopped until an operator can independently establish
quiescence. This is a supported completion contract for a live host and intact
transport, not crash recovery or a daemon-wide lock. External clients and user
input require Halo's desktop arbitration too.

For a host that explicitly needs raw `type_text(scope="desktop")`, use the
public `DesktopActionQueue` and one `CuaDriverClient({timeoutMs:null,...})`:

```js
import { DesktopActionQueue, CuaDriverClient } from 'opensky-cua';
const queue = new DesktopActionQueue();
const driver = new CuaDriverClient({ binaryPath: process.env.OPENSKY_DRIVER_PATH,
  socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false,
  session: 'halo-desktop', timeoutMs: null });
const typing = queue.submit(() => driver.call('type_text', {
  scope: 'desktop', text: 'éΩ中🙂'.repeat(250),
}));
try { await typing.wait({ timeoutMs: 500 }); }
catch (error) { if (error.code !== 'desktop_wait_timeout') throw error; }
typing.cancel(); // remains active if dispatch already began
await typing.wait();
await queue.drain();
```

Global desktop input goes to the focused app. Halo must authorize and hold
focus ownership. Prefer exact bound native/window calls when possible.

## Explicit foreground browser input

```js
import { createOpenSky, createCua } from 'opensky-cua';
const sdk = createOpenSky({ target: 'linux',
  driverOptions: { binaryPath: process.env.OPENSKY_DRIVER_PATH,
    socket: process.env.OPENSKY_DRIVER_SOCKET, autoStart: false } });
const cua = createCua(sdk, { emit: () => undefined });
const tab = await cua.createBrowserTab('chrome', 'http://127.0.0.1:8123/');
await tab.getScreenshot({ emit: false });
await tab.click([80, 80], { deliveryMode: 'foreground' });
await tab.getScreenshot({ emit: false }); // preceding input invalidates mapping
await tab.scroll([300, 300], 'down', 1, { deliveryMode: 'foreground' });
await tab.close(); await sdk.close();
```

Run these calls inside the persistent host queue in Halo. Legacy SDK equivalents
are `sdk.click({...delivery_mode:'foreground'})` and
`sdk.scroll({...delivery_mode:'foreground'})`. Foreground chooses the **trusted**
route for browser refs and coordinates. It may activate Chrome/window/tab and
move focus. It preserves exact owned session/target/tab and observation checks.
It never silently chooses synthetic events. The default coordinate route keeps
background posture and Linux Chrome can refuse with
`browser_input_trust_unavailable`/`route_unavailable`. Ref actions without opt-in
retain their existing explicit `dom_event` behavior; this is not a fallback for
failed trusted input. A stale screenshot or ref refuses before input.

Driverb973a50b also preserves the executed foreground branch in public
`delivery.mode` for trusted click and wheel results. The Mac fixture verifies
trusted counter0→1 and scroll0→600 before/after; the upstream-only intermediate
fix still misreported wheel delivery and is retained in
[browser delivery evidence](browser-delivery-59.json). These results remain
`effect:"unverifiable"`; mode is neither application verification nor a promise
that focus changes. This does not establish Linux sandboxed browser acceptance.

`deliveryMode` records per-call foreground consent, not permission to bypass
policy. Halo must only expose that option to authorized tools/extensions and
serialize with other foreground users. A driver manifest can separately deny
the tool or exact resource. There is no distinct driver `--grant foreground`
flag. Do not imply that foreground input preserves another user's focus.

## Linux native paste

```js
const capability = await sdk.get_capabilities();
if (capability.nativePaste.availability !== 'supported') {
  console.log(capability.nativePaste.reason);
  // Disable native paste UI; do not dispatch an absent tool or emulate paste.
}
```

`get_capabilities()` inspects the selected binary's platform tool registry, not
permission grants or live application readiness. The host must launch its daemon
from that **same immutable binary**; it must not pair an old daemon with a new
client binary. An injected transport without registry introspection reports
`unknown`, not support. Registry inspection errors remain explicit errors.
The verified candidate above registers `native_paste` on X11 and reports
availability `supported`, formats `["text"]`, clipboard `payload-left`.
This reports the binary capability; it does not grant clipboard/desktop access
or promise that a particular application's editable can be verified.
Wayland and old drivers without this tool remain unavailable; injected transports
without registry inspection remain unknown. Neither case dispatches an absent tool.

```js
// Run within Halo's persistent desktop host queue. The exact app/window must
// already be owned/bound; app.paste explicitly chooses foreground native input.
const action = host.submit(async ({ cua }) => {
  const app = await cua.getApp('Mousepad');
  return await app.paste('Café Ελληνικά 中文 🙂\nsecond line');
}, { label: 'paste plaintext' });
await host.wait(action.id);
await host.drain();
```

The Linux compound operation activates/confirms the exact bound window and
requires one focused, enabled native AT-SPI editable, a complete scoped read,
current value/selection, and its own clipboard payload readback before one
Ctrl+V. It confirms the expected exact resulting value on the same retained
AT-SPI identity. Password, web content, ambiguous/partial observations and
unprovable windows refuse. Limits:1..16384 UTF-8 payload bytes and262144 existing
characters. Rich formats and clipboard restoration are unsupported on X11.
Do not silently replace paste with typing or synthetic AT-SPI PasteText.

**Clipboard behavior:** payload-left, no snapshot/restore. Success reports
`target_value_verified:true`, `transfer_verified:false`, `clipboard_policy:"leave"`
and `clipboard_restored:false`. Value readback is not transfer provenance.
An observed external clipboard writer is never overwritten; another desktop
client can still race the final checks. No global atomicity is promised.
Errors can follow clipboard mutation or partial input. Retain structured
`input_dispatched`, `effect` and `clipboard_may_have_changed`; a partial or
unverified paste reports `native_paste_unverified` with unknown effect, never
permission to replay. A waiter deadline/Stop leaves active work tracked until
its original action settles. Observe application contents after drain.

Add explicit clipboard access to a **version3** bounded manifest; version1/2
cannot grant it. This is independent of the exact desktop/window resources and
tool allowlist:

```yaml
version: 3
expires_after: 1h
idle_timeout: 30m
resources:
  clipboard:
    write: [text]
  desktop:
    windows:
      - pid: 1234
        window_id: 5678
allow:
  tools: [start_session, end_session, native_paste]
```

Add the required observation/discovery tools and their reviewed resources when
binding through the facade; see the concrete supervisor template below. The
native test deliberately allows `clipboard_read` as a tool but omits its read
resource: it still refuses `bounded_resource_outside_manifest`. Write access
never exposes prior clipboard text. Native paste privately reads its own payload
to verify delivery. Version3 has no `mode` field; select bounded mode on daemon
startup and approve that exact manifest. No unrestricted permission is needed.

The historical0.2.20 driver had no native paste tool and correctly refused
`unsupported_native_paste` with text, selection and clipboard unchanged. Those
older unsupported outcomes above remain historical; they are not positive paste
acceptance. Browser/Mac paste keep their separate capabilities and policies.

## Target environment and explicit grants

Reproduction workflow: dispatch `linux-benchmark-preflight.yml` on this SDK
branch with `halo_contract=true`. It compiles the pinned driver inside
`node:22-bookworm`, creates ordinary uid1001, starts Xtigervnc on `:1` and XFCE,
and runs driver/editor/Chrome inside one `dbus-run-session`. It does not require
`/dev/uinput`, privileged containers, a physical Xorg session, Wayland, or
Chrome sandbox-disabling flags. The fixture's GTK editor uses real AT-SPI;
its independently sampled buffer/selection/clipboard and Ctrl+S saved file are
the application oracle. Browser instrumentation records actual click
`isTrusted`, scroll and focus; it injects no input. Sandbox probe output is
retained before browser acceptance is attempted. Owned renderer process evidence
also checks NoNewPrivs, seccomp enforcement and an extra filter beyond the
container baseline, while rejecting sandbox-disabling argv flags.

Runtime packages used: `tigervnc-standalone-server xfwm4 xfce4-panel dbus-x11 gsettings-desktop-schemas dconf-gsettings-backend
at-spi2-core libatk-adaptor python3-gi gir1.2-gtk-3.0 x11-utils xdotool wmctrl
xclip fonts-dejavu fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji` plus
Google's sandboxed Chrome .deb and dependencies. Build packages: `clang
pkg-config libdbus-1-dev libx11-dev libxi-dev libxtst-dev libxext-dev
libxkbcommon-dev libssl-dev curl ca-certificates`, Rust1.97.1 and Node22.
The artifact records exact package/Chrome/Node versions and binary SHA256.

The daemon, desktop and Node host must share `DISPLAY=:1`, the same
`DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR`, and the X server's `XAUTHORITY`
when authentication is enabled. Set `XDG_SESSION_TYPE=x11`, enable the AT-SPI
registry and GTK accessibility bridge (`NO_AT_BRIDGE=0`, `GTK_MODULES=gail:atk-bridge`,
`org.gnome.desktop.interface toolkit-accessibility=true`). The fixture uses a
localhost-only unauthenticated VNC server for testing; Halo should keep its own
server authentication. A persistent HOME stores profiles/settings, but does not
restore a queue's in-memory action IDs after a Node host crash.

Start each reviewed authorization domain once, as the desktop's ordinary user:

```sh
/opt/opensky/opensky-driver --socket "$HALO_NATIVE_SOCKET" serve --no-overlay \
  --permission-mode bounded \
  --capability-manifest /etc/halo/native-grants.yaml --approve-capability-manifest \
  --pid-file "$XDG_RUNTIME_DIR/halo-native.pid"
```

Use the corresponding browser manifest/socket/PID file for the browser daemon.
Keep manifests immutable to workers. [The reproducible supervisor](../e2e/halo/session.sh)
contains both concrete manifest templates and exact startup/cleanup commands;
replace its editor PID/window and loopback origin with host-reviewed resources.
Readiness and application capability checks are separate from registry checks.
The example manifests expire after one hour, or after 30 minutes idle. A
persistent production supervisor must arrange explicitly reviewed grant renewal;
SDK session revival does not renew or expand daemon permissions.

Use a host-reviewed capability manifest for each authorization domain (see
[the mixed-grant contract](#mixed-native-and-origin-scoped-browser-grants)) with `--permission-mode bounded
--capability-manifest grants.yaml --approve-capability-manifest` on daemon
startup. The fixture grants its exact editor PID/window, Chrome executable window
observations, isolated browser profiles, the loopback origin and listed
observation/input/lifecycle tools. Chrome executable observations cover all its
windows in this isolated test desktop; that scope must be explicitly reviewed
for Halo or replaced with known exact PID/window grants. Display
input is an explicit grant for the global typing reproduction. No unrestricted
permission mode, existing-profile grant, filesystem transfer, network-wide
origin grant or `/dev/uinput` grant is used. For production, replace fixture
PID/window/origin and tool list with Halo's reviewed resources and keep the
manifest read-only to workers. An environment where Chrome's sandbox cannot
initialize remains unsupported for this acceptance run; the test must fail
without changing Chrome sandbox or container privileges.


## Mixed native and origin-scoped browser grants

Actual run38176273234 passed258 required embedded SDK owners on Node22.23.3
and started TigerVNC/XFCE/GTK, but the daemon rejected the first manifest before
input: origin-scoped manifests cannot also allow raw desktop tools such as
`type_text`, `hotkey` or `get_window_state`. This is an enforced policy boundary,
not an application permission prompt. No GUI acceptance was earned by that run.

The dedicated acceptance lane therefore starts two persistent instances of the
**same pinned binary**, each with its own explicit socket/PID file and reviewed
immutable manifest: native input/observation and typed browser/origin input.
One host-side `DesktopActionQueue` serializes both transports on the same
Xtigervnc/D-Bus desktop. These instances outlive all requests; they are not
recreated per worker. A single `OpenSkyHost` is for one authorization domain;
use the public queue for multiple domains:

```js
import { DesktopActionQueue, CuaDriverClient, createOpenSky, createCua } from 'opensky-cua';
const queue = new DesktopActionQueue();
function domain(socket, session) {
  const driver = new CuaDriverClient({ binaryPath: process.env.OPENSKY_DRIVER_PATH,
    socket, session, autoStart: false, timeoutMs: null });
  const sdk = createOpenSky({ driver, target: 'linux', session,
    homeDir: '/home/halo/.opensky/' + session });
  return { sdk, cua: createCua(sdk, { emit: () => undefined }) };
}
const native = domain(process.env.HALO_NATIVE_SOCKET, 'halo-native');
const browser = domain(process.env.HALO_BROWSER_SOCKET, 'halo-browser');
// Registered host tools choose a domain; workers receive only the action ID.
const action = queue.submit(async () => {
  const tab = await browser.cua.createBrowserTab('chrome', 'http://127.0.0.1:8123/');
  await tab.getScreenshot({ emit: false });
  await tab.click([80, 80], { deliveryMode: 'foreground' });
  await tab.close();
});
await action.wait(); await queue.drain();
// Server shutdown, after all workers/extensions stop admission:
await queue.close(); await native.sdk.close(); await browser.sdk.close();
```

Use one requested input per submission for finer Stop behavior. A callback
that batches multiple inputs is one active action and may continue the batch
after Stop. All submissions from one worker can share its AbortSignal so queued
ones cancel together while the active input remains tracked.

Separate manifests do **not** create a joint origin security boundary if the
host also exposes global desktop typing: global input can hit the focused Chrome
window. Halo must authorize global input and hold focus ownership, or restrict
native tools to reviewed exact native targets. Joint per-tool native/browser
resource policy in a single origin-scoped manifest is not supported by the
pinned driver. The acceptance manifest's explicit display input grant is needed
for the reported `type_text(scope="desktop")` reproduction, not a minimal grant
for every Halo tool. No unrestricted mode is used in either instance.


## Native screenshots and partial observations (SDK0.2.5)

A native X11 window with existing compositor backing can be captured while
covered. The driver resolves the current client ancestry and crops only the
exact client interior; it does not redirect, repaint or activate the window.
Without backing, covered/clipped/unviewable pixels are unavailable. The driver
refuses rather than declaring an undefined or black placeholder a valid frame.
Unusual incompatible pixel encodings and complex unbacked shapes remain
conservative refusals. This is an X11 contract; Wayland acceptance is separate.

The SDK preserves accessibility state in a partial result:

```js
import { createOpenSky, createCua } from 'opensky-cua';
const sdk = createOpenSky({ target: 'linux', autoLaunch: false,
  homeDir: '/home/halo/.opensky', screenshotDir: '/home/halo/.opensky/shots',
  driverOptions: { binaryPath: '/opt/opensky/opensky-driver',
    socket: process.env.HALO_NATIVE_SOCKET, autoStart: false } });
const app = await createCua(sdk, { emit: () => undefined }).getApp('Mousepad');
const state = await sdk.get_app_state({ app: app.toJSON().targetHandle,
  includeScreenshot: true, disableDiff: true });
if (state.screenshotError) {
  console.log(state.text); // real AX data remains available
  console.log(state.screenshotError.code, state.screenshotError.suggestion);
  // state.screenshot is null; no stale image/file carrier is exposed.
}
await sdk.close();
```

`ScreenshotError` is an exported TypeScript type with `code`, `message` and an
optional `suggestion`. `app.getAXStateAndScreenshot()` exposes this optional
field too. A capture-only `app.getScreenshot()` throws `OpenSkyError` with the
precise `window_capture_unavailable` code and bounded explanation. Failed
capture retires the previous screenshot's coordinate authority: obtain a fresh
valid screenshot before coordinate input. Current AX observations remain a
separate source of element authority.

Pre-create the host-owned screenshot directory and grant only that directory
in the native daemon's bounded manifest, in addition to its reviewed display,
application/window and tool grants:

```yaml
resources:
  files:
    write:
      - dir: /home/halo/.opensky/shots
        recursive: false
```

This is a manifest fragment, not a replacement for the complete native manifest.
SDK native screenshot output outside the reviewed directory correctly refuses
`bounded_resource_outside_manifest`. The separate origin-scoped browser manifest
keeps its policy boundary. Run these SDK calls inside Halo's shared host queue;
only explicitly authorized foreground input may change focus.


[Final capture application run38476505768](https://github.com/tanishqkancharla/opensky/actions/runs/38476505768) verifies both compositor modes on SDK runtime6535e4db4577a5d3673bc5c6b260bb771a1ce9e3 / Driver34f3d150ea7ef86ce171ed7bb3724ce218448e64. Independent root pixels verify foreground text, covered text with compositing, restored and legitimate-dark text frames. Without backing, covered capture returns the precise error while AX and foreground remain intact. Both sets of seven supervisor processes and owned occluders exit, with no forced shutdown. [Before/after capture evidence](linux-covered-capture-53-fixed.json). Version/README/report changes for the release do not modify the tested TypeScript runtime.


## Optional strict JavaScript evaluation (SDK0.2.6)

Halo's separate QuickJS workers can continue calling the persistent Node host
without using OpenSky's optional strict AsyncRepl. For hosts that use it, plain
Node22/24 now enforce the existing VM timeout, poison the timed-out evaluator
and retain stale-cell capability refusal without enabling legacy async hooks.
This is not permission to reuse a poisoned evaluator or replay input.

[Actual run38481237185](https://github.com/tanishqkancharla/opensky/actions/runs/38481237185)
uses the bounded TigerVNC/shared-bus desktop on the exact SDK/driver pins above.
Two strict cells retain the exact GTK app handle and read real `replace me`
AT-SPI text across a realm await; artifact ownership is preserved. Both
compositor modes pass the existing independent capture oracles; all14 owned
supervisor processes and both occluders exit without forced shutdown. This
observation control sends no input and does not establish new typing, browser
or paired benchmark acceptance. [Evidence](linux-strict-bridge-56.json).

### Host instrumentation refusal (SDK0.2.29)

Strict evaluation now checks Node promise execution tracking before a first cell
and each awaited VM resume. When active, it refuses with public
`AsyncReplError.code === "strict_runtime_unsupported"` and
`evaluatorUsable === false`; subsequent calls report a poisoned evaluator.
Preloaded hooks refuse before any cell effects. If tracking becomes active while
a host action is awaited, that action may already have effects; the continuation
is refused. The host must separately await/drain its already dispatched actions.
Nothing is cancelled, replayed or rolled back by this evaluator refusal.

```ts
import { AsyncRepl, AsyncReplError } from "opensky-cua";
const evaluator = new AsyncRepl({ allowNodeApis: false, strictSandbox: true });
try {
  await evaluator.evaluate("return 42");
} catch (error) {
  if (error instanceof AsyncReplError && error.code === "strict_runtime_unsupported") {
    // Discard this evaluator. Run strict cells in a separately supervised Node
    // process without legacy async_hooks instrumentation; never replay input.
  } else { throw error; }
}
```

This conservative public-API probe neither inspects nor disables the host's
hooks. V8-only promise attribution remains compatible. Node's test runner also
enables tracking, so positive strict scenarios run in externally bounded
standalone processes. Keep evaluation separately supervised if trusted host code
can enable incompatible instrumentation inside an already-entered synchronous
VM turn: a check between turns cannot preempt arbitrary host code during a turn.
The SDK supplies no process isolation or crash recovery. Both Node22/24 retain
synchronous/microtask deadlines, timeout poisoning and stale capability refusal.
[Before/after probe evidence](strict-runtime-56-refusal.json). Actual bridge verification passes on current Bookworm native and Ubuntu22
sandboxed-browser host desktops; the Mac control is read-only. Prior evidence
retains its original source pins and environment scope.


## Chrome sandbox startup preflight

Run the repository's opt-in probe as Halo's ordinary desktop user before a full
driver/desktop acceptance build (requires Node, Python3, clang and Google's
Chrome package):

```sh
python3 e2e/halo/sandbox-preflight.py --output /tmp/halo-sandbox-readiness --require-ready
```

It creates and reaps isolated namespace probe processes, launches only a private
headless Chrome profile with its default sandbox, and records exact syscall
results, exit status and policy observations. It changes no kernel/LSM/seccomp
policy and adds no process capabilities. Exit1 means sandbox startup is
unavailable under the current policy; an OpenSky capability manifest cannot
grant denied kernel namespace operations. Successful startup is only a
prerequisite: it does not verify visible tabs, trusted click/scroll, renderer
isolation, focus behavior or the shared TigerVNC/D-Bus desktop. The full
`halo_contract=true` lane still owns those application assertions; it now gates
on this probe before Rust compilation. Capture-only lanes remain independent.

[Actual probe38485034979](https://github.com/tanishqkancharla/opensky/actions/runs/38485034979)
used SDK sourceab7b4fa868f0387d13854c34703cd0309a84f041, Node22.23.3 and
Chrome155.0.8059.79 in Bookworm as uid1001 with zero effective capabilities.
Both clone and unshare for user-only and user/PID/network namespaces return
EPERM; Chrome exits SIGABRT before an SDK tab or desktop action. The container
reports one seccomp filter, docker-default AppArmor enforcement, enabled
unprivileged_userns_clone, and apparmor_restrict_unprivileged_userns=1. These
observations establish a host/container namespace refusal; they do not isolate
a single policy layer as its cause. No privileged or unconfined container,
sandbox-disabling flag or policy relaxation was used. The probe leader was
reaped and the job's container stopped. [Original diagnostic evidence](linux-sandbox-readiness.json).

Docker documents argument/capability restrictions on namespace calls in its
[default seccomp profile](https://docs.docker.com/engine/security/seccomp/).
Halo's operator must provide a reviewed host/container policy under which
Chrome's normal namespace sandbox can start. This report does not prescribe a
blanket security relaxation or prove that Halo's already sandboxed Chrome
shares this hosted runner's restriction. Sandboxed browser GUI acceptance remains
unverified here; no new native-input or paired benchmark score follows from this
probe. Dispatch `halo_sandbox_probe=true` for this diagnostic alone.


## Rebinding a native app after process restart (SDK0.2.30, issue72)

A fresh `await cua.getApp(name)` discovers the current native process and returns
a separate binding. The direct SDK equivalent is
`await sdk.get_app_state({app: name, scope: "app", includeScreenshot: false})`.
Keep that returned handle for subsequent actions. After its process exits, a
retained app/opaque handle refuses; it never migrates to a replacement process.
Calling `listApps()` is inventory only. It does not change retained handles.
If several visible processes match the name, fresh discovery still refuses
ambiguity. Do not invent selector substrings or replay uncertain input.

The change is verified by a real Mac process restart and the Bookworm run above;
installed distribution qualification is recorded with the release. The separate
Mac cold-file launch66 limitation remains open.
