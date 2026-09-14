# macOS SDK validation — September 14, 2026

**16 of 18 distinct checks passed: all nine standalone Chrome checks and seven
of nine native checks.** The two native failures occurred during document
opening, before their paste or selection actions. An additional Chrome startup
failure was retained; after an explicitly authorized installation-metadata
repair, all nine browser cases passed on fresh isolated sessions.

This used the installed OpenSky Driver on the user's actual Mac, not a simulated
platform. Tests called the public SDK and observed real app state, saved files,
HTTP-backed page outcomes, or screenshots. It was deterministic SDK testing plus
one visually reviewed native capture, not a matched agent evaluation or canonical
macOS release matrix.

- macOS 15.7.9, build 24G830.
- SDK checkout `e6dbbb06c769146ca6d0e6d3f29fe9113007a834`; all 21 built runtime
  JavaScript files exactly match the installed `595250e3a61624ffef8bf7a07d886fb392ec0f01` package.
- Driver source `028471ff1d307b9455c39039f9aa5e1b73d4da05`.
- Driver binary SHA-256 `8be5bec39a355ffcf90f4330f1fd8f07863192711a722530a484ecd8eb9b5082`.
- No model evaluation calls; coding-agent inference is separate.

## Native results

| User-visible behavior | Result |
| --- | --- |
| Paste two lines and save exact contents | Pass |
| Replace the intended repeated word after Unicode text | Pass |
| Reject an ambiguous match without losing the prior selection | Pass |
| Insert immediately before a match | Pass |
| Insert immediately after a match | Pass |
| Open the requested same-named file and close it while preserving its sibling | Pass |
| Observe a native document through AX and an actual readable screenshot | Pass; screenshot visually reviewed |
| Paste and restore the previously active app | Failed during opening; paste not attempted |
| Replace a match after a long Unicode prefix | Failed during opening; selection not attempted |

The five editing cases took 16.2–17.9 seconds each, including setup and cleanup.
Same-named document isolation took 17.8 seconds; native capture took 11.5 seconds.
The opening failures stopped after 14.1 and 16.2 seconds. Earlier successful
paste/focus and long-selection runs remain separate evidence; they do not erase
these fresh failures.

Both failures returned `native_target_unproven`. One independent observation
found only an Open dialog. The other found the requested-title window, but its
`document_url` was null, with a second off-screen window also present. The SDK
therefore could not prove exact document ownership. The evidence does not show
why the metadata or handoff was unavailable, or establish user interference.
Do not weaken ownership checks or adopt a window by title to make these pass.

The normal failure fixture deliberately refused cleanup without a proven SDK
handle. Manual recovery rechecked the fresh process identities from the launch
errors, their independently observed windows, and the pre-launch baseline,
then cooperatively quit only those two test-created processes. Both temporary
files were unchanged and removed. The original failures remain recorded.

## Standalone Chrome results

All nine cases passed after repair: multiline plaintext paste, HTML emphasis,
literal Markdown paste, contextual qualifiers in lists/articles/tables, Unicode
and punctuation, newly loaded content, and stale-control rejection without
activating a replacement or sibling. The batch took 44.9 seconds.

The initial browser attempt stopped before launch: Apple's strict code-signature
verification rejected `com.apple.FinderInfo` metadata inside the installed Chrome
bundle. With explicit user approval, 69 metadata entries were backed up and
removed. Both the complete bundle and executable then passed the Google signing
requirement. No code bytes or browser profiles changed. The driver trust check
was preserved. The repair and its reversible metadata backup are retained locally.

The existing canvas-scroll case was deliberately unselected because its
foreground witness requires X11. It is not a macOS pass. Existing user-tab
inventory, rich native clipboard formats, Finder/Safari, and LibreOffice dialogs
were not exercised by this run.

## Cleanup and evidence

Every owned native process exited and every scratch document was removed,
including both manually recovered failures. The user's pre-existing TextEdit
instance survived. All nine successful browser session leases were released,
and no Chrome processes remained. The temporary observer binary/cache were
removed; the retained evidence is approximately 2 MB.

Local receipt: `work/macos-broad-20260914/acceptance.json`. It preserves all
attempts, saved-file hashes, original failures, repair/cleanup evidence, and the
native screenshot review. These local files are not represented as publicly
hosted artifacts. The [current macOS validation](macos-current-validation.md)
retains historical results and remaining capability limits.
