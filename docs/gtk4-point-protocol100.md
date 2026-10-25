# GTK4 read-only point ownership remains unproven

[Fresh Bookworm run40174593340](https://github.com/tanishqkancharla/opensky/actions/runs/40174593340), SDK harness `fdb55619e82c5604493176d2b48e61b3e6176d75`, unchanged driver `096490a1721a4fe693623531f9ba0cf5e20806d0`. [Structured evidence](gtk4-point-protocol100.json).

This independent protocol diagnostic sends **zero focus requests and zero input**. A green diagnostic means its replies and unchanged application state were captured; it does not establish SDK pointer or focus support.

## Actual result

In a fresh owned GTK4 window, the accessibility bus daemon mapped the selected connection to application PID14721. Selection required one `Receipt input` label and advertised Component/EditableText interfaces inside that exact application. The application had one top-level frame, mapped X11 bounds `(426,288,428,329)`.

The entry returned equal Screen and Window extents `(29,192,342,32)`. Its Window-coordinate center is `(200,208)`. The entry's `Component.Contains` returned true there. The top-level frame's `Component.GetAccessibleAtPoint` at that same Window-coordinate point returned the null accessible reference immediately: no entry/descendant was identified. Only the frame was on the hit chain; exactTargetOnChain remained false. The read-only query phase took4.27ms.

**Contains is not pointer ownership.** A toolkit can report a geometrically contained point without proving which visible control receives it. These replies do not justify removing Showing checks, granting an unknown pointer exception, choosing a sibling, or inferring target identity from bounds. They are consistent with the retained driver placement returning unknown, without proving the exact internal decision in the older driver run.

Five fresh independent application samples retained active window, unfocused entry, empty text, zero field/popup activation, closed popup and unchanged counters/events. All four owned supervisors exited unforced. No GrabFocus, click, typing or fallback was sent. The separate [focus-method probe](gtk4-focus-protocol99.md) already confirmed NotSupported and was not repeated here.

Environment: ordinary uid1001, Debian Bookworm, Node22, TigerVNC/X11 `:1`, XFWM4, shared D-Bus/AT-SPI. GTK packages4.8.3+ds-2+deb12u1, libatspi2.46.0-5; GTK library SHA256 `83fef9e03bf8117428cb184cc76da6f3e4dc672713081a0d2306c2a26fd1a2d7`. No uinput, VM, privileged container or sandbox bypass. Existing embedded/native/Stop/drain/rebind consumer gates also pass using the approved released driver archive.

## Reproduce only this diagnostic

```sh
gh workflow run linux-driver-release.yml --repo tanishqkancharla/opensky --ref main -f reuse_archive=true -f point_ownership_probe=true
```

Inspect `linux-driver-release-consumer/gtk4-point-protocol/{point-protocol.json,supervisor-cleanup.txt}`. The optional mode shares the existing exact-application protocol fixture; the focus-capability owner and default SDK lanes remain separate. No product runtime or release assets changed.

## Supported route and remaining work

The independently verified [fresh capture-bound foreground coordinate route](gtk4-entry96.md#public-sdk-path-for-an-embedded-host) remains available when selected before input. It is not an automatic fallback from uncertain semantic input. Issue#76 remains open; the original semantic-focus failure is retained.

A possible driver improvement is to preserve an authoritative toolkit NotSupported reply as an actionable foreground-focus refusal rather than discarding it into a generic unverified result. That requires a separate implementation, relevant regression coverage and fresh SDK-level before/after refusal/application evidence; this read-only protocol test does not implement or validate it. Unknown/timed-out replies must remain uncertain and must never trigger replay or another input route.

Mac#19/#66 and full paid-source/ownership admission remain unresolved. No Mac driver rebuild, signing/permission change, benchmark agent, new scored pair or comparative resource improvement is claimed. Supported release0.2.45 is unchanged.
