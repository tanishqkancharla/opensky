# Web typing: retained values cannot prove partial delivery

Mac driver source `1e63ff2d7b0f0e5267cea2e216d5fa2cf0c537c4` fixes a demonstrated unsafe suffix-retry recommendation. Release 0.2.40 still pins the preceding driver until fresh release qualification completes.

An owned WKWebView input independently records trusted input events and retains only the first two characters in its value. One foreground `type_text` dispatch sends `Alpha87`. The application receives all seven trusted characters, while the field ends at `Al`.

Before the fix, driver `95b620a301c23af9da5f771c7c3f0a448a91590c` returns `type_text_incomplete`, `delivered_chars: 2`, `retry_from_character: 2`, `retryable: true`. That advice could duplicate already-consumed input.

After the fix, the same application effects return `effect: "unverifiable"` and omit those three fields. The empty-value case also passes. No action is replayed. The polling bound and native partial-count behavior are unchanged. Atomic AX partial readback uses the same conservative web classification; the live fixture exercises foreground keyboard delivery.

Validation: 711 Mac units pass (seven host opt-ins ignored), the polling owner detects removing the positive-count fix, E2E typecheck passes, and both real application cases pass with one dispatch each. Exact owned child processes exit and their temporary bundles are removed. Stable signing identity, Accessibility and Screen Recording grants, and actual daemon 250/50 ms observation settings are preserved. [Structured application receipts](web-partial-typing89.json).

```sh
cd e2e
OPENSKY_REAL_DRIVER=1 OPENSKY_DRIVER_BINARY=/Applications/OpenSkyDriver.app/Contents/MacOS/opensky-driver npm test -- specs/native-web-self-clearing.test.ts
```

This is Mac native AX-backed web typing coverage. CDP and other platform input are unchanged; their behavior is not certified by this fixture. Mac cold launch/document issues #19/#66, sandboxed Bookworm Chrome, Windows GUI and full paid-source admission remain unresolved. No benchmark score or spending change is claimed. The SDK runtime is unchanged; a new package release requires fresh source-pinned archive qualification.
