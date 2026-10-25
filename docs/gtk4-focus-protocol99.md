# GTK4 focus protocol: confirmed unsupported on the tested Debian library

This is an independent toolkit diagnostic, **not a semantic-click fix or SDK focus acceptance**. [Structured evidence](gtk4-focus-protocol99.json). [Fresh run40160142461](https://github.com/tanishqkancharla/opensky/actions/runs/40160142461), SDK harness `7c33e876b047b7faa30fbd775f25ad95fb86ce1e`, unchanged driver `096490a1721a4fe693623531f9ba0cf5e20806d0` (0.38.0). Release0.2.45 remains supported without asset changes.

## Actual reply and application state

A fresh owned GTK4 entry received exactly one direct `org.a11y.atspi.Component.GrabFocus` request. The accessibility-bus daemon independently mapped its connection to the owned application PID14727. Selection required the unique `Receipt input` label plus advertised Component and EditableText interfaces, inside that application only.

The method returned **`org.freedesktop.DBus.Error.NotSupported`** in0.69ms. Five fresh application-state samples after the reply retained active window, unfocused entry, empty text, zero entry/popup activations, closed popup and unchanged counters/events. No typing, second focus request, pointer fallback or uncertain replay followed. All four owned supervisors exited unforced.

Installed GTK packages were `4.8.3+ds-2+deb12u1`; libatspi was `2.46.0-5`. The actual `/usr/lib/x86_64-linux-gnu/libgtk-4.so.1.800.3` SHA256 was `83fef9e03bf8117428cb184cc76da6f3e4dc672713081a0d2306c2a26fd1a2d7`. Environment: ordinary uid1001, Debian Bookworm, Node22, TigerVNC/X11 `:1`, XFWM4 and a shared session D-Bus/AT-SPI. No uinput, VM, privileged container or Chrome sandbox bypass.

This confirms the fresh installed library's method reply, consistent with the [pinned GTK4.8.3 source](https://github.com/GNOME/gtk/blob/793831af8a224545495f0c56a184f4ee28e5cc55/gtk/a11y/gtkatspicomponent.c#L197-L200). It does not capture or rewrite the original SDK run40043907707's wire reply. The driver still conservatively reports its semantic focus request unverified. The fresh direct diagnostic does not exercise the SDK input route or establish Halo's production integration.

## Reproduce the diagnostic

The optional source-committed harness has no default-lane effect:

```sh
gh workflow run linux-driver-release.yml --repo tanishqkancharla/opensky --ref main -f reuse_archive=true -f focus_capability_probe=true
```

The workflow verifies and reuses the approved immutable source/hash-pinned driver archive; existing embedded/native/Stop/drain/rebind consumers run before the independent GTK diagnostic. Read `linux-driver-release-consumer/gtk4-focus-protocol/{focus-protocol.json,supervisor-cleanup.txt}`. A successful diagnostic means the unsupported reply and unchanged application state were observed; it does not mean focus succeeded.

The first harness attempt40159835001 failed before any focus request because raw GTK `GetRoleName` returns `text box`, whereas libatspi's display vocabulary reported `text`. It is retained with methodRequests0 and four unforced exits. The corrected lookup proves interfaces rather than relying on a role-name spelling, and records bounded raw names/roles.

## Supported route and remaining work

Select the independently verified [fresh capture-bound foreground coordinate route](gtk4-entry96.md#public-sdk-path-for-an-embedded-host) before input. It focuses the field and saves exact Unicode in its own fresh fixture; it is not an automatic fallback after a failed ref request. Do not call activate/submit to simulate focus or relax the Showing/ownership gates. If further semantic routing work is justified, inspect read-only exact-object point ownership first; do not repeat the now-confirmed unsupported method.

Issue#76 remains open. Mac#19/#66, full source/ownership/paid admission and sandboxed Bookworm Chrome remain unresolved. Mac driver bytes, stable signing identity, Accessibility/ScreenRecording grants, desktop and preserved Calendar are unchanged. No benchmark arms, new scored pairs or comparative improvement are claimed.


Subsequent [read-only point inspection](gtk4-point-protocol100.md) receives a null accessible reference from the top-level hit test despite entry Contains=true. It sends no focus/input and does not establish pointer ownership or relax the driver gates.
