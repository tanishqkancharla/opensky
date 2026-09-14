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

The older opening fixture closed both documents correctly but left its two
empty test processes alive. The parent independently inspected and quit them
with exact PID/bundle/launch-time checks, then removed their files. That opening
case still needs the same automatic process-cleanup improvement before it is
used as an unattended repeated test.

Raw evidence is retained locally in `work/macos-open-current-01`,
`work/macos-selection-current-01`, and `work/macos-paste-current-01`; it is not
represented as publicly hosted by this report. These deterministic SDK results
are separate from the frozen Linux paired agent measurement. No model inference
calls were made by these tests. macOS native paste and broader driver-followup
acceptance remain incomplete.
