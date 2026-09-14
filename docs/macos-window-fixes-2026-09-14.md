# macOS active-window fixes — September 14, 2026

OpenSky now prefers the exact accessibility-focused native window over stacking
order, activates the exact key window for foreground shortcuts, routes native
typing without an element directly through the foreground path, and accepts
semantic actions on attached sheets only when their live parent chain proves
the exact document window.

The original comparison found native observing the focused document while
OpenSky observed a different document. A new public SDK workflow then exposed
three additional problems: Cmd+N could create a document without transferring
focus; background typing could not distinguish sibling windows; and a Save
sheet's Delete button was rejected because the sheet had a separate window
identity. These have focused fixes without app-specific product guidance.

## Real Mac verification

During the user's quiet window, five distinct workflows passed on final driver
`622465b352590db3f983490261e9260537cc52dd`:

| Check | Outcome | Duration |
| --- | --- | --- |
| FOCUS-N01: create a second document, observe/type there, preserve the first, discard through Save sheet | Passed, including cleanup | 30.04 s |
| OPEN-N01: open/close the requested file while its same-named sibling remains open | Passed | 17.28 s |
| PASTE-N03: multiline paste/save and restore prior foreground app | Passed | 19.66 s |
| SELECT-N03: reject ambiguous selection while preserving the established range | Passed | 21.42 s |
| SELECT-N02: replace only the contextual match after long Unicode text | Passed | 16.66 s |

These are separate fresh fixtures, not a five-task agent campaign. The original
failed attempts remain recorded. Every final fixture verified its owned process
exited. GUI testing ended before the quiet window expired; final process
inspection found no TextEdit instances.

The five GUI checks used SDK source `0f07d615`. Final SDK `4562f756` removes
the preceding background attempt/retry and selects the same tested foreground
typing route directly. This avoids retrying after an unreadable AX write. That
last simplification received build and non-GUI verification; the GUI tests were
not rerun after the quiet window ended. All 21 installed runtime JavaScript
files match the final built package. Both installed agent skills were updated.

The 14 core background-input policy checks passed. The SDK suite passed 362/363
after removing a sandbox socket restriction; the remaining failure was a test
expecting asynchronous rejection from a synchronous closed-runtime guard.
After correcting that test, its full file and the skill-install tests passed.
The skill test now compares installed contents to the source, and the unused
runtime lifecycle test uses the real client and asserts public closed behavior.
No new mock desktop behavior was added. TypeScript build and E2E typecheck passed.

## Safety and remaining limits

Focused identity must match the exact PID and an eligible visible window.
Missing or invalid focus retains the previous unambiguous stacking fallback.
Exact document handles retain their original identity and close authority.

Attached-sheet proof checks every ancestor's PID and stops at the first window;
that window must map to the requested CGWindowID. It allows only semantic AX
actions. It does not authorize keyboard or pointer delivery through a sheet or
permit arbitrary same-process windows. Foreground shortcuts now refuse when
the exact key window cannot be established rather than sending global input
without that proof.

The earlier intermittent `open_target` failures did not recur, including in
the fresh same-name-file controls. Their causes remain unproved; this work
does **not** claim that LaunchServices handoff or missing AXDocument metadata
is fixed. Actual launch/window responses are now retained by Mac fixtures to
make the next occurrence diagnosable. No opening replay or relaxed file-identity
guard was added. Chrome's repaired installation was not changed in this work.

Installed driver SHA-256:
`c8fc87c0d96dda916af16310bc107bdd5141bc014676840811b862aa8e295707`.
The existing signing certificate and Accessibility/Screen Recording grants were
preserved. Linux's frozen agent scores were not changed.

Compact evidence: `work/macos-focus-fix-20260914/acceptance.json`,
`sdk-installed-identity.json`, `cleanup-recovery.json`, and the five workflow
receipts under `quiet-final/`, `final-controls/`, and `final-long-selection/`.
About 2 GiB of fresh debug output and a 52 MB orphan observer were removed;
the shared release cache and compact first-failure evidence were retained.
