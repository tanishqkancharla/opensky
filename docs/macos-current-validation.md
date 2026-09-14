# Current macOS SDK validation

The 2026-09-13 local candidate passed the real public-SDK multiline-paste workflow and a Unicode-selection regression control:

- SDK: `99eb49050bf77919715487ee30689b4f2cc30301`
- Driver: `082df36caf57aa7f5d5b4ca4652599afd736cc23`
- Driver binary SHA-256: `a59248620829b6801c5568f73b3149163d6998145b3092cee0c0ad5feb1c6ad7`

| Behavior | Result on this candidate |
| --- | --- |
| Select all, paste two lines, save, and verify exact file contents | Pass, 16.78 seconds including fixture |
| Replace the disambiguated second match after Unicode text, save, and verify | Pass, 58.69 seconds including fixture |
| Close owned document, quit its exact process, remove temporary files, preserve pre-existing process | Pass for both workflows |

The installed SDK was updated from a packed copy of this source, including its generic model skill. The driver uses the existing stable signing certificate. Accessibility and Screen Recording remain granted.

The first paste candidate returned an uncertain result without changing the document. A foreground candidate then inserted a literal letter instead of pasting. The accepted correction carries accumulated modifier flags on foreground key events and selects the guarded foreground route before dispatching modified macOS keys. These first failures remain retained; no uncertain paste is automatically replayed.

macOS paste currently supports plaintext up to 16 KiB into a focused control with readable AX value and UTF-16 selection range. It leaves the supplied text on the clipboard. AX outcome verification does not claim independent clipboard transfer or saved-file verification; these tests separately check actual saved files. Rich text and controls without the required AX evidence remain unsupported.

Earlier source `c69d3b8533ffc860759707737e45dc5578466b23` with driver `f0e316a8f9a40423491c5ca0c438c1e0d9626e3b` passed requested-file opening/closing, all three selection/insertion cases, and actual screenshot capture. Those historical results have not been relabeled as reruns of the new candidate. A separate protected-folder opening issue still awaits the relevant macOS file-access consent; Accessibility and Screen Recording do not grant folder access. The launch-timeout reporting correction is a separate draft, not part of the installed paste candidate.

Local evidence: `work/macos-paste-modifiers-01/acceptance.json`, `work/macos-selection-modifiers-01/acceptance.json`, and retained earlier failures under `work/macos-paste-{candidate,observed,foreground}-*`. Earlier evidence remains under `work/macos-open-cleanup-04`, `work/macos-selection-current-01`, and `work/macos-capture-existing-01`. These receipts are local, not publicly hosted artifacts.

These deterministic SDK smokes made no model inference calls and are separate from frozen Linux paired agent scores. They do not replace the canonical desktop release matrix. Broader macOS API parity and release validation remain incomplete.
