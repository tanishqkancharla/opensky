# Current macOS SDK validation

The 2026-09-13 local candidate passed six real public-SDK saved-document workflows: multiline paste and five native text-selection cases.

- SDK: `595250e3a61624ffef8bf7a07d886fb392ec0f01`
- Driver: `03d6078ff0f29acbdd1a1417d7fd34b7b110ffd0`
- Driver binary SHA-256: `3fb0866809eabadf47a04fb1cf8bd39fd30b244dc417c21cfbdb0bb229fa94df`

| Behavior | Result on this candidate |
| --- | --- |
| Select all, paste two lines, save, and verify exact file contents | Pass, 15.73 seconds including fixture |
| Replace the disambiguated second match after Unicode text | Pass, 16.28 seconds |
| Replace a contextual match beyond a 2,000-character Unicode prefix | Pass, 15.75 seconds |
| Reject an ambiguous match while preserving the established selection | Pass, 17.15 seconds |
| Insert at the before/after edge without replacing the match | Both pass, 15.41 / 15.52 seconds |
| Close owned documents, quit exact processes, remove temporary files, preserve pre-existing process | Pass for all six workflows |

Native selection now matches live AX text and writes one verified UTF-16 range instead of walking from the document beginning with individual keyboard events. The same short selection workflow previously took58.69seconds on SDK99eb490 and driver082df36c. The current16.28second result includes fixture setup and cleanup; it is not an isolated operation-latency measurement. This candidate reached its first real result82.96seconds after the ready build/install stage began. That is one measured iteration, not a general turnaround guarantee.

The installed SDK was updated from a packed copy of this source, including its generic model skill. The driver uses the existing stable signing certificate. Accessibility and Screen Recording remain granted.

The first paste candidate returned an uncertain result without changing the document. A foreground candidate then inserted a literal letter instead of pasting. The accepted correction carries accumulated modifier flags on foreground key events and selects the guarded foreground route before dispatching modified macOS keys. These first failures remain retained; no uncertain paste is automatically replayed.

macOS paste currently supports plaintext up to 16 KiB into a focused control with readable AX value and UTF-16 selection range. It leaves the supplied text on the clipboard. AX outcome verification does not claim independent clipboard transfer or saved-file verification; these tests separately check actual saved files. Rich text and controls without the required AX evidence remain unsupported.

Earlier source `c69d3b8533ffc860759707737e45dc5578466b23` with driver `f0e316a8f9a40423491c5ca0c438c1e0d9626e3b` passed requested-file opening/closing, all three selection/insertion cases, and actual screenshot capture. Those historical results have not been relabeled as reruns of the new candidate. A separate protected-folder opening issue still awaits the relevant macOS file-access consent; Accessibility and Screen Recording do not grant folder access. The launch-timeout reporting correction is a separate draft, not part of the installed paste candidate.

Local evidence: `work/macos-selection-atomic-short-01/acceptance.json`, `work/macos-selection-atomic-long-01/acceptance.json`, `work/macos-selection-atomic-edges-01/acceptance.json`, `work/macos-paste-atomic-control-01/acceptance.json`, `work/macos-sdk-install-595250e/acceptance.json`, and retained earlier failures under `work/macos-paste-{candidate,observed,foreground}-*`. Earlier evidence remains under `work/macos-open-cleanup-04`, `work/macos-selection-current-01`, and `work/macos-capture-existing-01`. These receipts are local, not publicly hosted artifacts.

These deterministic SDK smokes made no model inference calls and are separate from frozen Linux paired agent scores. They do not replace the canonical desktop release matrix. Broader macOS API parity and release validation remain incomplete.
