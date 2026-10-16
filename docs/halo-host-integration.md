# Persistent Linux host integration

## Verified X11 paste distribution

The native-only [application run38875586155](https://github.com/tanishqkancharla/opensky/actions/runs/38875586155) verifies SDK **`d14db52b22e63528b335f1ebdc71c02a094cd9dc`** with driver **`c36e63ef8e7387cd827596169396b63cbfe68f30`** (driver version0.35.4). SDK0.2.24 packages this same verified runtime and exact driver pin. The0.2.23 package predates Linux native paste support. Documentation-only successors do not change that tested runtime. [Compact application evidence](halo-x11-native-paste-evidence.json).

On ordinary uid1001, Bookworm, Node22.23.3, TigerVNC/X11 and a shared D-Bus/AT-SPI session, public `app.paste` saves exact ASCII and Unicode selected replacements. The clipboard is left with the payload. A private GTK handler accepting only three characters produces saved `par`; the SDK reports unknown effect after the host500ms wait deadline and Stop request, with one dispatch and no replay. Missing foreground and missing clipboard resources refuse before mutation; clipboard write does not grant clipboard read. All seven owned supervisor processes exit without forced termination.266 required embedded SDK owners,503 whole Node22 owners and666 Linux units pass; these are separate from application evidence.

The original1000-character Unicode typing owner remains:41 characters are visible at the500ms wait deadline; the action remains active after Stop, finishes in13.781seconds and saves all1000 characters before the following Save starts. Queued cancelled input never dispatches. This is a completion/drain contract, not hard cancellation. Sandboxed Chrome is explicitly not run and remains unverified.

## Previous release pins and verification boundary

The earlier verified distribution is **SDK0.2.20**, with Driver **0.35.4**,
runtime source **`6647fa8d7f5edc0337d0d616f00c202df68b9bc4`**.
The current [native acceptance run](halo-0220-native-evidence.json) uses
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

[Current native application run38838190369](https://github.com/tanishqkancharla/opensky/actions/runs/38838190369)
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

**External legacy `node:async_hooks` remains a Node VM interruption limitation.**
An embedding host that enables such hooks can still abort on promise runaway
interruption on Node22 or24. The Node22 async-context-frame startup flag does
not solve that external-hook case. Issue56 remains open. Keep strict evaluation
in a separately supervised process if host instrumentation enables legacy hooks;
do not run it inside a production desktop server that must survive every cell.
No automatic host-hook detection, process isolation or crash recovery is supplied
by this SDK. No startup flag or removal of timeout/sandbox enforcement is part
of the fix. Sandboxed Chrome acceptance remains independently unverified.


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
