# Current macOS SDK validation

On 2026-09-13 the installed OpenSky SDK `c69d3b8533ffc860759707737e45dc5578466b23`
and OpenSky Driver `f0e316a8f9a40423491c5ca0c438c1e0d9626e3b`
(binary SHA-256 `6f11c320173612ca996d589ec51c45e777a60022f981e938d3c773a8883b278e`)
passed four real public-SDK cases. Native paste remains unsupported on macOS
and its real test failed at the public operation.

| Behavior | Result |
| --- | --- |
| Open/close requested file while same-named sibling remains readable | Pass |
| Replace second repeated match after Unicode text | Pass |
| Insert before that match without replacing it | Pass |
| Insert after that match without replacing it | Pass |
| Capture existing native window | Pass: actual PNG visually verified |
| Paste multiline text | Fail: native paste unavailable |

Selection and insertion were verified from the actual saved files, before
teardown input. The three selection cases took 55.25, 47.31, and 54.99 seconds
including their fixtures; this is correctness evidence, not a latency claim.
The paste attempt retained the original file unchanged. Permissions and fixture
setup succeeded; this failure is not a permission request or a reason to retry.

The selection/paste fixture now opens its temporary document through public
`open_target`, binds its exact returned window to an independently observed
fresh process identity, and records ownership before test input. It closes the
exact document through `close_target`, cooperatively quits only the verified
process, verifies exit, and removes the temporary file. The existing user
TextEdit process remained running throughout all four cases. This permits
these tests without asking the user to quit TextEdit.

The opening fixture now records exact returned window/process identities and
quits both owned test processes after the public document closes. Its fresh
OPEN-N01 run passed in 19.29 seconds, including verification that temporary
files were removed and the existing user TextEdit process remained running.
The first fixture attempt failed before input because SDK methods are frozen;
a separate forwarding facade corrected the observer without changing SDK calls.

Actual screenshot capture through the installed CLI succeeded and its PNG was
visually verified. The existing window was only read, with no input or cleanup
sent to it. Both Accessibility and Screen Recording are granted. The screenshot
was removed after verification; its dimensions and hash remain in the receipt.

Fresh app launching remains intermittent: two subsequent attempts timed out in
NSWorkspace before opening a document. Restarting the same installed daemon
allowed the opening test to pass, but a later launch timed out again. This is
not resolved and is separate from permissions. One intervening screenshot
attempt was stopped by shell-sandbox desktop visibility; that result does not
establish that the user's desktop was locked.

Raw evidence is retained locally in `work/macos-open-current-01`,
`work/macos-selection-current-01`, and `work/macos-paste-current-01`; it is not
represented as publicly hosted by this report. These deterministic SDK results
are separate from the frozen Linux paired agent measurement. No model inference
calls were made by these tests. macOS native paste and broader driver-followup
acceptance remain incomplete.

Additional local evidence: `work/macos-open-cleanup-04`, `work/macos-screenshot-current-03`, and `work/macos-capture-existing-01/acceptance.json`.
