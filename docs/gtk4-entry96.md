# GTK4 coordinates and supported Linux input routes

OpenSky **0.2.45**, SDK consumer `e79e1ebbcc16b4ca3871e4a0a10ec02ed3148dca`, driver **`096490a1721a4fe693623531f9ba0cf5e20806d0`** (0.38.0). [Structured evidence](gtk4-entry96.json). [Fresh Bookworm consumer40045288833](https://github.com/tanishqkancharla/opensky/actions/runs/40045288833). The immutable binary was built in40043907707 with SDK59876bf3; consumer reuse does not change that identity.

## Verified changes and limits

GTK4 4.8.3 reported the entry's Screen and Window extents identically as `(29,192,342,32)` despite the mapped X11 window origin `(426,288)` and GTK shadow `(14,12)`. The old driver projected these as negative screenshot coordinates. The corrected snapshot/cached/inverse geometry produces screen frame `(469,492,342,32)`, screenshot frame `(43,204,342,32)`. Distinct true Screen answers keep their previous path; equality at native origin `(0,0)` alone is not used as proof. Non-GTK/Wayland coordinate policy is unchanged.

Visible GTK4 children also omit Showing. Do not infer they are invisible or grant an unproven pointer route. Native foreground single-ref clicks on Editable/Focusable/Visible controls request Component.GrabFocus rather than activate/submit. No second route runs after that dispatch, including timeout/uncertain readback. GTK4 4.8.3 still fails that focus request in this environment: actual entry focus stays false, activation count stays zero and no typing follows. The original semantic-focus assertion remains failed in [40043907707](https://github.com/tanishqkancharla/opensky/actions/runs/40043907707); [issue #76 stays open](https://github.com/tanishqkancharla/opensky/issues/76). The old inaccurate off-screen note is replaced with unconfirmed-visibility guidance.

A **separate fresh fixture** verifies the explicitly foreground pixel path: a capture-bound click at `(214,220)` maps to screen `(640,508)`, reports `route: global_input`, `path: x11_xtest_fg`, and actually focuses the entry. Reusing that consumed capture returns `capture_not_found`/`effect: refused`; an old closed-popup token from the same SDK session returns `stale_element_token`, with focus/text/counters unchanged. One typing request produces `Popup ASCII café Ελληνικά 日本語 🙂`: exactly 49 UTF8 bytes, SHA256 `0ab6d45bbb5de12f6e4fc316b6395204e5496a907fd955f8b8d21b481de46f24`. Independent application focus/counters/text receipts and real screenshots agree; field activation and popup activation both remain zero. The driver itself conservatively reports input effect unverified; this application evidence confirms the outcome. This is not an automatic fallback or semantic-ref acceptance.

## Why the GTK4 semantic focus route remains unsupported

Source review identifies a concrete toolkit limitation: the GTK 4.8.3 implementation of `Component.GrabFocus` unconditionally returns the D-Bus `NotSupported` error; that method does not request widget focus. See the [pinned GTK implementation](https://github.com/GNOME/gtk/blob/793831af8a224545495f0c56a184f4ee28e5cc55/gtk/a11y/gtkatspicomponent.c#L197-L200).

This is consistent with the retained application-level failure (field focus false, text empty, zero activation). It is an inference from upstream source, **not a captured method reply from the tested Debian binary**. GTK version alone does not establish the distribution's exact patched source. OpenSky 0.2.45 currently treats a missing or negative focus acknowledgement conservatively as unverified; the result does not establish toolkit focus support. A successful outer request or active window is insufficient evidence of field focus.

No runtime fix, new GUI acceptance, or toolkit upgrade is claimed here. If another diagnostic is needed, capture that exact method error once in a fresh owned fixture. Do not retry an uncertain click, activate/submit the entry, or silently choose a pointer route. Choose the independently verified foreground coordinate path before input when this toolkit's semantic route cannot establish focus. Issue #76 remains open.

## Public SDK path for an embedded host

Keep the client and desktop queue in the Node host across workers. The example functions below use the public SDK; the host supplies its owned target and a screenshot directory covered by its grants. Call `observe`, inspect its PNG, then choose coordinates from that image and call `foregroundClick` with its exact capture ID. Serialize conflicting work through the [persistent host lifecycle contract](halo-host-integration.md).

```js
import {CuaDriverClient} from 'opensky-cua';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const binaryPath = process.env.OPENSKY_DRIVER_PATH;
const socket = process.env.OPENSKY_DRIVER_SOCKET;
if (!binaryPath || !socket) throw new Error('Configure the host driver and socket');
const client = new CuaDriverClient({
  binaryPath, socket,
  autoInstall: false, autoStart: false, timeoutMs: null,
  session: 'halo-desktop',
});
function target({pid, windowId}) {
  if (![pid, windowId].every(n => Number.isSafeInteger(n) && n > 0))
    throw new TypeError('An owned PID and window ID are required');
  return {pid, window_id: windowId};
}
export async function observe(owned, hostScreenshotDir) {
  const result = (await client.call('get_window_state', {
    ...target(owned), include_screenshot: true,
    screenshot_out_file: join(hostScreenshotDir, randomUUID()+'.png'),
  })).structured;
  if (!result?.capture_id) throw new Error('An exact window capture is required');
  return result;
}
export async function foregroundClick(owned, captureId, x, y) {
  if (typeof captureId !== 'string' || !captureId.trim() ||
      ![x, y].every(n => Number.isFinite(n) && n >= 0))
    throw new TypeError('A fresh capture ID and image coordinates are required');
  return (await client.call('click', {
    ...target(owned), capture_id: captureId, x, y,
    delivery_mode: 'foreground',
  })).structured;
}
```

The same client/session must publish and consume the capture. Its ID binds immutable PNG bytes, coordinate frame, session/generation, target, lifetime and one-shot admission; it does not prove arbitrary UI content can never change. Reobserve after UI changes. A worker Stop does not cancel an already-dispatched daemon action. Await/query the host action completion and inspect uncertain effects before admitting conflicting input; never replay uncertain input or imply rollback. SDK close detaches its sessions, not a shared desktop/daemon.

## Environment, grants and other retained contracts

Actual environment: ordinary uid1001, Debian12 Bookworm, Node 22.23.4, TigerVNC X11 `:1`, XFWM4, GTK4.8.3, shared D-Bus/AT-SPI. Build Rust 1.97.1, locked Cargo graph, glibc2.36. The workflow installs the committed X11/TigerVNC/XFWM4/AT-SPI/GTK/Python GI/font runtime packages; the binary manifest lists production shared-library dependencies. No uinput, VM, privileged container or Chrome sandbox bypass.

The owned GTK manifests grant display read, only the exact app PID/window, screenshot writes in the owned nonrecursive shots directory, and tools start/end session, list apps/windows, get window state, bring to front, click, press_key, type_text. Foreground mode is explicitly supplied. Native paste requires its separate clipboard-text-write/native_paste grants; these are not inferred from screenshot or click authority.

725 Linux tests, 275 embedded SDK checks and 3 TLS owners pass. Original One/Dot/Two counters and popup keyboard controls still pass; all four supervisors in each of three GTK owners exit unforced. Existing native selected ASCII/Unicode paste saves exact 29/46 bytes and leaves the payload clipboard; partial paste saves `par`, reports unknown effect, dispatches once. At a 500 ms typing deadline, 49 of 1,000 codepoints are visible; completion saves all 1,000 codepoints / 2,750 UTF8 bytes before following Save starts. Queued cancellation dispatches nothing. Rebind and relative capture retain their own receipts.

Mac source behavior is unchanged: all runtime edits are confined to platform-linux. A local source096 build retains the same com.opensky.driver signing certificate and existing Accessibility/Screen Recording grants; read-only original Calendar capture and WindowServer health pass. This is not new Mac input/full acceptance.

Remaining: semantic GTK4 ref focus (#76), Mac cold-launch #19/#66, sandboxed Bookworm Chrome, Windows GUI/Wayland/other architectures and full paid-source admission. Native acceptance is not Halo's complete production image or QuickJS integration acceptance. No benchmark arm, scored pair or comparative resource improvement is added.
