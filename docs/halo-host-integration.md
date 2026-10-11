# Persistent Linux host integration

## Candidate and verification boundary

Base SDK: `5b547875b3ed6bec7c0cd2e11882a9141c069cf3` (OpenSky PR49).
Driver: **0.34.1**, source `dd5f9f539289f88b942939d0ee077f8c1d2899cd`
(Cua fork PR49). The SDK changes in this document require this feature branch;
`opensky-cua@0.1.2` on npm does not identify or include this contract.
Use an immutable commit, build with `npm ci --ignore-scripts && npm run build`,
and record `git rev-parse HEAD` and driver `--opensky-driver-identity`.
Do not substitute the forks' default branches.

Local validation: 490 SDK tests pass; one Bun-only test skipped, Node24.19.
These include queued cancellation, active Stop and waiter timeout, unknown
completion fencing, exact/stale browser forwarding and absent native paste.
They are contract fixtures, **not application-level Linux acceptance**.
Hosted acceptance runs the files in `e2e/halo/` and records original results in
`artifacts/halo/evidence.json`. A missing or failing hosted result does not
establish TigerVNC or sandboxed Chrome compatibility.

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
fire-and-forget calls escape the queue contract. Later callbacks stay queued
until the current callback settles. Queue cancellation prevents the callback
from executing. Active cancellation is a stop request only: **no hard cancel**,
no rollback, no replay of uncertain input. Abort/deadline on `wait` only detaches
that waiter; the original request and result remain owned by the host. Multiple
waiters can use the same ID. The host's underlying input transport has no client
operation deadline; lifecycle readiness checks still have bounded deadlines.
Do not configure a 500ms driver timeout for this host.

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
The pinned Linux driver has no `native_paste`: availability is `unavailable`,
formats `[]`, clipboard `untouched`. Both ASCII and Unicode `app.paste` calls
refuse `unsupported_native_paste` before paste, replacement typing, clipboard
mutation or paste key dispatch. Selected content is not replaced. Browser paste
and Mac native paste remain separate capabilities.

Thus exact inserted ASCII/Unicode and selected-text replacement are **unsupported
Linux native paste outcomes**, not passing acceptance tests. No clipboard
preservation receipt can be promised for an operation that is unavailable.
No partial native paste is dispatched by this SDK capability refusal. Existing
browser/Mac paste errors can follow input: retain receipts, observe effects and
never automatically replay uncertain delivery.

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

Use a host-reviewed capability manifest with `--permission-mode bounded
--capability-manifest grants.yaml --approve-capability-manifest` on daemon
startup. The fixture grants only its exact editor PID/window, owned isolated
Chrome, loopback origin and listed observation/input/lifecycle tools. Display
input is an explicit grant for the global typing reproduction. No unrestricted
permission mode, existing-profile grant, filesystem transfer, network-wide
origin grant or `/dev/uinput` grant is used. For production, replace fixture
PID/window/origin and tool list with Halo's reviewed resources and keep the
manifest read-only to workers. An environment where Chrome's sandbox cannot
initialize remains unsupported for this acceptance run; the test must fail
without changing Chrome sandbox or container privileges.
