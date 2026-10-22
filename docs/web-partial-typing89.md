# Web typing: retained values cannot prove partial delivery

Mac driver source `1e63ff2d7b0f0e5267cea2e216d5fa2cf0c537c4` fixes a demonstrated unsafe suffix-retry recommendation. OpenSky 0.2.41 selects this exact source. [Release assets](https://github.com/tanishqkancharla/opensky/releases/tag/v0.2.41).

An owned WKWebView input independently records trusted input events and retains only the first two characters in its value. One foreground `type_text` dispatch sends `Alpha87`. The application receives all seven trusted characters, while the field ends at `Al`.

Before the fix, driver `95b620a301c23af9da5f771c7c3f0a448a91590c` returns `type_text_incomplete`, `delivered_chars: 2`, `retry_from_character: 2`, `retryable: true`. That advice could duplicate already-consumed input.

After the fix, the same application effects return `effect: "unverifiable"` and omit those three fields. The empty-value case also passes. No action is replayed. The polling bound and native partial-count behavior are unchanged. Atomic AX partial readback uses the same conservative web classification; the live fixture exercises foreground keyboard delivery.

Validation: 711 Mac units pass (seven host opt-ins ignored), the polling owner detects removing the positive-count fix, E2E typecheck passes, and both real application cases pass with one dispatch each. Exact owned child processes exit and their temporary bundles are removed. Stable signing identity, Accessibility and Screen Recording grants, and actual daemon 250/50 ms observation settings are preserved. [Structured application receipts](web-partial-typing89.json).

```sh
cd e2e
OPENSKY_REAL_DRIVER=1 OPENSKY_DRIVER_BINARY=/Applications/OpenSkyDriver.app/Contents/MacOS/opensky-driver npm test -- specs/native-web-self-clearing.test.ts
```

This is Mac native AX-backed web typing coverage. CDP and other platform input are unchanged; their behavior is not certified by this fixture. Mac cold launch/document issues #19/#66, sandboxed Bookworm Chrome, Windows GUI and full paid-source admission remain unresolved. No benchmark score or spending change is claimed. The SDK runtime is unchanged. Fresh Bookworm build and separate consumer [39719016542](https://github.com/tanishqkancharla/opensky/actions/runs/39719016542) use SDK b098847cbfc36914c54bc61b063aa03003e59d43 and this driver: ordinary UID1001, TigerVNC/X11/XFWM4, shared D-Bus/AT-SPI, bounded grants. Selected ASCII/Unicode paste saves exactly; uncertain partial paste dispatches once; 52/1000 Unicode characters are visible at the500ms deadline, then all1000/2750bytes save before the following Save. Queued cancellation, process replacement, GTK4 counters and relative capture pass. All7 native,3rebind and4GTK4 supervisors exit unforced;724Linux units,275embedded SDK and3TLS checks pass. Three-platform CPU run39719012411 passes separately. Sandboxed Bookworm browser remains unqualified. Install the attached GitHub tarball; npm registry authentication remains pending.
