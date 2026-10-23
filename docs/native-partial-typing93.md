# Withhold uncertain native typing retry counts

OpenSky 0.2.43 selects driver `9efa30f02189b33f2b09370e9cc0daaab25972ea` (0.38.0), extending the Mac typing safety fix. Qualified SDK source is `6fbe949cce9c6c007d18da4297dcb8373bc27778`. The TypeScript runtime is unchanged. [Structured application receipts](native-partial-typing93.json).

## Reproduction and actual effects

An owned native AppKit editor independently records successful AX setter calls and actual keyboard events, while retaining only a selected prefix in its displayed value. One public SDK call sends `Alpha87` to the exact PID/window:

```js
const result = await sdk.driver.call("type_text", {
  pid, window_id, text: "Alpha87", delay_ms: 50,
  delivery_mode: "background", // use "foreground" only when authorized
});
```

On released driver2947bad807, the background call invokes AXSelectedText once. The app consumes all seven characters but retains `Al`. The error reports delivered_chars2, retry_from_character2 and retryabletrue. On intermediate driver355fef757 (the atomic-AX fix only), foreground input posts seven keyDown events; the app again consumes all seven and retains `Al`, while the driver gives the same unsafe suffix advice. Original failed assertions and application receipts are retained; neither call is replayed.

Final candidate9efa30f021 returns effect `unverifiable` without delivered_chars, retry_from_character or retryable for both routes and retained prefixes0/2. Each independent application receipt contains Alpha87 exactly once: one AX setter in background, seven keyDown events in foreground. Exact screenshots/window observations are captured around each input. All four permanent TYPE-N07 cases pass; exact children and temporary bundles exit/disappear.

## Contract and tradeoff

A retained prefix or unchanged displayed value cannot establish the number of characters an application consumed. Atomic AX edits now withhold native partial counts. Synthesized typing still polls through partial readbacks for complete text, with its existing bounds; incomplete readback at the deadline returns uncertainty on native and web surfaces. The timeout branch no longer needs an ancestry probe to decide whether a prefix is a receipt.

A real partially consumed request also loses suffix-retry advice unless independently established. Observe actual application effects before deciding on further input. There is no automatic replay, rollback or inferred zero delivery. Complete positive readback, exact-window/stale-target checks, pre-dispatch refusals, delivery-mode authorization and cancellation/completion APIs retain their existing behavior. Linux and Windows input implementations are unchanged.

## Validation and limits

711 Mac platform units and E2E typecheck pass on the final source. Before the four-case verification, existing foreground WebKit TYPE-W02 prefix0/prefix2 owners pass. Existing FOCUS-N01/SHEET-N01 subsequently pass, including exact document preservation, positive native typing into the addressed sibling and cancelling its Save sheet. The stable signer, Accessibility/Screen Recording grants and actual250/50ms daemon observation settings are unchanged. Full cleanup preserves the original Calendar baseline.

```sh
cd e2e
OPENSKY_REAL_DRIVER=1 OPENSKY_DRIVER_BINARY=/Applications/OpenSkyDriver.app/Contents/MacOS/opensky-driver npm test -- specs/native-ax-no-replay.test.ts
```

Fresh [Bookworm39897260360](https://github.com/tanishqkancharla/opensky/actions/runs/39897260360) independently verifies the extracted binary under bounded grants: exact native ASCII/Unicode paste and selected replacement, uncertain partial delivery, queued cancellation, completion/drain after a 500 ms deadline (52 codepoints then 1,000 saved), replacement binding, GTK4 foreground counters and relative capture. All owned supervisors exit unforced. 724 Linux units, 275 embedded SDK and 3 TLS owners pass. [Three-platform driver39897258015](https://github.com/tanishqkancharla/cua/actions/runs/39897258015) and [SDK-main39897255783](https://github.com/tanishqkancharla/opensky/actions/runs/39897255783) pass. [Current native receipts](halo-current-native-evidence.json) and [archive hashes/install](linux-driver-distribution.md) accompany the release. These scoped owners do not close Mac19/66 or establish full Mac, sandboxed Bookworm Chrome, Windows GUI, Wayland or other architecture acceptance. The earlier background WebKit no-op-AX control remains a retained failed unconditional-delivery assertion; it is not reclassified as passing. No paid benchmark arms or score change.
