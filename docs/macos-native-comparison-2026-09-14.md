# macOS native Computer Use comparison — 2026-09-14

Native Computer Use completed both editing workflows associated with the two
earlier OpenSky opening failures. A fresh OpenSky open-only control also passed.
The earlier failures remain valid; this small comparison does not establish an
intermittent failure rate or prove native can never encounter them.

| Behavior | Native Computer Use | OpenSky evidence |
| --- | --- | --- |
| Open a document, multiline paste, save exact contents | Passed; saved file independently verified | Earlier PASTE-N03 stopped at `open_target`, leaving an Open dialog before paste |
| Open long Unicode text, replace only the final matching word, save | Passed; entire saved file independently verified | Earlier SELECT-N02 stopped at `open_target`; requested-title window existed but `document_url` was null |
| Fresh isolated file opening control | Both documents opened through native UI | One new public `open_target` attempt passed, with exact AXDocument identity and verified cleanup |
| Observe an app with two documents open | Returned focused `select.txt` before and after OpenSky reads | Legacy and native-style facade returned `paste.txt` |

The native API available in this session has no `open_target` equivalent. Native
opened the disposable files using TextEdit's Open dialog. OpenSky's isolated
opening path asks LaunchServices for a new process and requires proof of the
requested file before returning a closeable target. These are comparisons of
user-visible outcomes, not identical launch operations. Native foreground
restoration was not measured in this comparison.

## Window-selection difference

The same TextEdit process (2051) held both files. OpenSky Driver reported
`paste.txt` window 224692 at z-index 418 and `select.txt` window 224705 at 263.
Both had correct AXDocument URLs and were reported visible on the current Space.
The SDK's app-scoped resolver selects maximum z-index, explaining its choice.
Native observations continued to report the focused `select.txt` and its final
edited contents.

This establishes a difference between native and OpenSky document selection.
It does not prove that WindowServer order was inverted: accessibility focus and
window stacking can diverge. Do not reverse z-order based on this result. The
next focused regression should compare both signals with two documents open;
matching native's active-document behavior may require exposing exact focused
window identity and preferring it when valid for the same process.

## Scope and evidence

SDK runtime was unchanged from the broader run: tested source e6dbbb06, installed
runtime 595250e3, with all 21 runtime JavaScript files previously verified equal.
Driver source was 028471ff, binary SHA-256
`8be5bec39a355ffcf90f4330f1fd8f07863192711a722530a484ecd8eb9b5082`.
No product code or driver binary changed for this investigation.

Evidence is in `work/macos-native-comparison-20260914/`: `comparison.json`,
`native-outcomes.json`, `opensky-facade-full.json`, `driver-windows.json`, and
`open-control/driver-calls.jsonl`. Native actions and observations are also in
the task's native Computer Use tool transcript. The control records real driver
responses without mocking them. Original failures remain under
`work/macos-broad-20260914/`.

Chrome's earlier signature/metadata failure was already repaired before this
comparison. There is no native pre-repair result, so whether native would have
encountered it remains untested.

Both native test documents were saved and checked before quitting the
test-created TextEdit process. The OpenSky control independently verified its
exact process exited. Final process inspection found no TextEdit instances.
Disposable files were removed after preserving their assertions and hashes.
