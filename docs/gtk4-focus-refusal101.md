# GTK4 unsupported focus: explicit SDK refusal

## Supported scope

The Linux native foreground ref-click route preserves an authoritative D-Bus `org.freedesktop.DBus.Error.NotSupported` reply from the exact observed widget as an `OpenSkyError` with code `native_focus_unavailable`. The SDK call rejects. This does not add semantic focus support to GTK4 4.8.3. Issue [76](https://github.com/tanishqkancharla/opensky/issues/76) remains open; its original positive focus assertion stays failed.

Exact candidate driver: `5f5c17bbc2a9f8c6260d151ec734b86fab164ae8` (0.38.0).
SDK application consumer/build: `0b1d73ae66df06c886b00449ab53929002adff34`.
Qualification status: **pending**; do not infer application acceptance from passing unit tests.

## Public SDK handling

This uses the existing `App.click` API; no new flag is needed. With an owned, bound app handle and the fresh entry index obtained from its observation:

```js
const observation = await app.getAXStateAndScreenshot({ emit: false, disableDiffing: true });
console.log(observation.state);
// Choose the Receipt input index from this fresh observation.
try {
  await app.click(entryIndex, { deliveryMode: "foreground" });
} catch (error) {
  if (error.code !== "native_focus_unavailable") throw error;
  console.log(error.code, error.details.native_error);
  // No retry or fallback here. Observe current state before deciding further work.
}
```

The independently runnable SDK owner, [gtk4-refusal-contract.mjs](../e2e/halo/gtk4-refusal-contract.mjs), includes driver/session construction, exact owned PID/window checks, saved state, screenshots and detach. The optional release workflow input `entry_refusal_probe=true` runs it in a fresh TigerVNC/XFWM4/shared D-Bus/AT-SPI session under ordinary UID1001. The fixture needs GTK4 and AT-SPI GObject bindings (`gir1.2-gtk-4.0`, `gir1.2-atspi-2.0`) in addition to the [existing Bookworm packages](../.github/workflows/linux-driver-release.yml).

Required bounded grants: display observation, the exact application PID and window ID, writes only to the owned screenshot directory, and `start_session`, `end_session`, `list_apps`, `list_windows`, `get_window_state`, `bring_to_front`, `click`. This refusal owner has no keyboard or typing grant, `/dev/uinput`, privileged-container access or Chrome sandbox bypass.

## Lifecycle and error semantics

| Outcome | Contract |
| --- | --- |
| Exact remote `NotSupported` | Reject with `native_focus_unavailable`, `effect: refused`, `verified: false`, native error name, `ax_action: grab_focus`, pointer/text input sent false. |
| Authorized window activation | May already have occurred before widget focus is refused; foreground report is retained. No rollback promise. A window change cannot promote widget refusal to confirmed input. |
| Timeout, absent reply, transport error, local unsupported error | Remain uncertain under the existing delivery contract; never reclassified as an authoritative toolkit rejection. |
| Input fallback/replay | None. No activation/submit action, second pointer route, keyboard or typing request follows the rejected focus call. |
| Session close | SDK detaches its session; the host daemon outlives it. The test supervisor independently reaps only its four owned processes. |

Fresh capture-bound foreground pixel input remains a separately supported choice with its own exact-target/capture/stale checks, [evidence and limits](gtk4-entry96.md). It is not automatically attempted after uncertain or refused ref input. The strict Showing/pointer-ownership gate is unchanged.

## Before and after evidence

Before: [run40191634139](https://github.com/tanishqkancharla/opensky/actions/runs/40191634139), SDK owner `961e22c7c68d0b7d2b827b104a8dbf505b59aa03`, unchanged released driver `096490a1721a4fe693623531f9ba0cf5e20806d0`. One fresh foreground ref click returned normally; five independent application samples stayed unfocused with empty saved text, zero activation and unchanged popup/counters. The new owner failed specifically because the SDK did not reject with the exact code. All four supervisors exited unforced. This is the deliberate before/mutation check, not a newly failing product path introduced by the test.

After: [run40191882567](https://github.com/tanishqkancharla/opensky/actions/runs/40191882567), application result pending. Existing embedded/native paste/partial/Stop/drain/rebind and GTK button/popup/keyboard/pixel owners run before the separate fresh refusal owner. The previous semantic-positive failure remains retained.

Driver [whole Linux build/unit run40191234471](https://github.com/tanishqkancharla/cua/actions/runs/40191234471) passed: 728 platform, 345 driver, 68 contract, 1162 core tests. Focus reply classification is tested against exact remote NotSupported versus NoReply/Timeout/UnknownObject/UnknownMethod, local Unsupported and text-containing errors. A formatter test covers refusing focus despite a confirming window change. These unit checks do not establish native application behavior.

## Remaining limitations

No new Mac input/full-source paid qualification, Windows GUI or Wayland qualification, semantic GTK4 ref focus, sandboxed Bookworm Chrome, or benchmark score improvement is claimed. The installed Mac driver/signing identity/grants remain unchanged. No paid model arms were dispatched for this correction.
