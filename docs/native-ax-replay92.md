# Stop after an acknowledged but unverified AX edit

Driver candidate `2947bad8071540f3dc53fa44ec586a6735bb528a` fixes duplicate background typing on macOS. OpenSky 0.2.41 still selects driver `1e63ff2d7b0f0e5267cea2e216d5fa2cf0c537c4` until fresh release qualification completes. [Structured before/after evidence](native-ax-replay92.json).

## Actual application effects

An owned native AppKit editor consumes a successful `AXSelectedText` write and clears its displayed field. Its independent application receipt records AX setter calls and keyboard events.

One public SDK driver-client call sends `Alpha87` with `delivery_mode: "background"`. The previous driver calls the AX setter once, sees an unchanged value, then posts seven keystrokes. The app receives `Alpha87Alpha87`. The returned error says `type_text_incomplete`, `delivered_chars: 0`, `retry_from_character: 0`, `retryable: true`.

The corrected driver calls the AX setter once and posts no keystrokes. The app receives `Alpha87` once. The response is `effect: "unverifiable"`, with no delivered-character count or retry offset. Its hint says the application effect is unverified and forbids automatic retry. There is no rollback or replay.

A successful setter with unchanged or unreadable state now ends the background ladder. An AX rejection retains its existing fallback path. Complete and partial AX readback branches, foreground typing, exact-window targeting, polling bounds and cancellation/completion APIs are unchanged. Linux and Windows input delivery implementations are unchanged; native uncertain-typing hints use the same more accurate wording on all platforms.

## Choosing input delivery

Choose the delivery mode before dispatch. Public SDK native ambient `app.typeText(text)` already selects the exact-window foreground route on Mac. Driver-client callers can explicitly choose `delivery_mode: "foreground"` up front when authorized. A background result with an unverified effect requires observation of the actual application before deciding on another input; an empty displayed field alone does not prove non-delivery.

An owned WebKit background control exposes the tradeoff: the old driver posts seven keystrokes after a silent AX acknowledgement; the corrected driver stops with an unverified effect and no input events. The exploratory assertion that every background call must produce events fails and remains retained. It is not relabeled as a passed test. Both existing foreground WebKit cases still receive all seven trusted characters once. This preserves the no-replay contract even when the AX acknowledgement was a no-op.

## Validation and scope

- Permanent public SDK owner TYPE-N07 fails before the fix and passes on the final signed candidate, with one AX call and zero key events. Its native receipt and window state confirm the application effect.
- Existing FOCUS-N01/SHEET-N01 and both foreground TYPE-W02 cases pass on behavior source `ea34bdd3e71c12ef02276d28b3375bb5d9cc9ada`. The final candidate has byte-identical Mac typing implementation; its additional change is truthful recovery text and coverage for that text.
- All 711 Mac platform units, 1,159 core units and E2E typecheck pass. Stable driver signing, Accessibility and Screen Recording grants, and actual 250/50 ms daemon observation settings are preserved. Exact owned processes and temporary bundles are removed; the original Calendar baseline remains.

```sh
cd e2e
OPENSKY_REAL_DRIVER=1 OPENSKY_DRIVER_BINARY=/Applications/OpenSkyDriver.app/Contents/MacOS/opensky-driver npm test -- specs/native-ax-no-replay.test.ts
```

Fresh source-pinned archive and cross-platform release qualification remain pending. This is not full Mac acceptance or sandboxed Bookworm Chrome/Windows GUI acceptance. Mac #19/#66 remain open. Native partial-count behavior outside this acknowledged AX no-replay case is unchanged. The SDK runtime is unchanged; no paid benchmark arm or score change is claimed.
