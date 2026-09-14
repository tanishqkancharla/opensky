# Linux Unicode typing during application stalls

A reproduced X11 typing failure silently omitted the em dash from
`A café near Dublin Zoo — 中文 😀.` when the application paused for about 650 ms.
The driver returned success, but both the saved document and application text
events lacked the character. Its temporary keycode mapping had already been
restored while the application was stopped.

Driver candidate `cfe578ba53afce435486694bcb0048e81f2d9a34` keeps each temporary
mapping until an advertising client returns its matching `_NET_WM_PING` reply.
It rechecks the actual recipient immediately before injecting the key. A timeout
returns uncertain delivery without replay. This is a generic X11 protocol path;
there is no application-specific typing guidance or replacement with paste.

The real SDK checks passed on fresh remote desktops using binary SHA-256
`84936266d67805c0ab8fd9712026780a69bdad579740ade8b13d65c877a3d59e`:

| Public behavior | Result |
| --- | --- |
| Unicode typing while the owned app paused for 650.91 ms | Full saved sentence; five matching app acknowledgements before map restoration |
| Ordinary Unicode typing | Full saved sentence and restored keyboard map |
| Menu shortcut after typing | Saved text unchanged by the accelerator |
| Committed TYPE-L03 with optional passive diagnostics disabled | Full saved sentence after 650.64 ms pause; required stall observer and cleanup worked |

The first three checks used frozen SDK `c69d3b8533ffc860759707737e45dc5578466b23`.
The permanent test used SDK `a67bd1464e18b75cf900ba9f00be3b285e5ef19d`, directly
from its committed source without fixture overlays. Every check verified the
actual saved file and owned application/container cleanup. The new test is
`TYPE-L03` in `e2e/specs/linux-typing.test.ts`; the fixture owns the pause,
pidfd/start-time checks, watchdog, independent emergency resume, and cleanup.
Tests continue to drive the same public select/type/save actions.

[Candidate builds and unit checks](https://github.com/tanishqkancharla/cua/actions/runs/34816598668)
passed on Linux, macOS, and Windows. Linux included 20 input tests (one additional
case intentionally ignored), 188 driver tests, 33 contract tests and 660 core tests.
[Canonical desktop and installer validation](https://github.com/tanishqkancharla/cua/actions/runs/34817566624)
passed all 265 Linux/Windows desktop cases, both source-installer checks, and
all three platform builds. This does not include the canonical macOS GUI matrix
or migration from a previously published driver release.

The [full SDK run](https://github.com/tanishqkancharla/opensky/actions/runs/34818732007)
passed the nine existing cases on each of three fresh desktops (27 passes).
TYPE-L03 stopped before its controlled pause because the workflow lacked the
disposable-desktop flag. These three configuration failures remain recorded.
The [focused correction](https://github.com/tanishqkancharla/opensky/actions/runs/34820063198)
passed TYPE-L03 and ordinary TYPE-L01 on three fresh desktops (six passes, 24
intentionally skipped checks). Actual pauses were 650.62, 650.44, and 650.65 ms.

Both runs used the same release binary, SHA-256
`a0bb400f185094e292507b642c77714ded1361b45c181526385c3fa59a00500a`.
Only the workflow changed between SDK sources `a6741e88` and `db0ebbe91`:
it declares the hosted desktop disposable and pins the independently downloaded
release artifact for reuse. The product and test code are identical. Across the
two runs, all ten distinct cases have passing evidence: 27 independently checked
saved documents, six UI-only assertions, three verified stalls, and 36 owned-app
cleanup/keymap receipts, including the three initial setup failures. This is
combined acceptance, not a claim that the first full run was green.

This does not prove universal X11 text consumption: clients without the ping
protocol retain the older delay and its known limitation. Custom event loops,
synthetic typing, named-key remapping and the final focus-check-to-input race
remain outside this acceptance. The native reference was not run under this
artificial stall. The original differently corrupted prefix is retained and is
not claimed to have the same cause.

These are deterministic SDK regressions, not new agent scores. The original and
repeat 20-task results remain frozen. No evaluation model calls were made for
this correction. Ready source to first relevant result took 374 seconds, so the
five-minute feedback target was not achieved on this iteration.
