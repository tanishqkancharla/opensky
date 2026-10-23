# Withhold uncertain native typing retry counts

Driver candidate `9efa30f02189b33f2b09370e9cc0daaab25972ea` extends the Mac typing safety fix. OpenSky 0.2.42 still selects driver `2947bad8071540f3dc53fa44ec586a6735bb528a` until fresh archive qualification completes. The TypeScript runtime is unchanged. [Structured application receipts](native-partial-typing93.json).

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

Fresh exact-source Bookworm archive and three-platform qualification remain pending. These scoped owners do not close Mac19/66 or establish full Mac, sandboxed Bookworm Chrome, Windows GUI, Wayland or other architecture acceptance. The earlier background WebKit no-op-AX control remains a retained failed unconditional-delivery assertion; it is not reclassified as passing. No paid benchmark arms or score change.
