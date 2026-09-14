# Linux V15 paired measurement

**OpenSky passed 17/20 tasks (85%); native Computer Use passed 15/20 (75%).** OpenSky passed every native-success task. The final audit verified all 20 matched pairs, 40 distinct scored attempts, 40 distinct reservations, unchanged source/environment/scoring fingerprints, saved outcomes and owned-app/container cleanup. There were no unscored or retried attempts in this full campaign.

This reaches or exceeds the native reference score on this fixed Linux benchmark. It does not establish general API parity or statistical non-inferiority across unseen tasks. The separate macOS checks and selection-key diagnosis are not part of these 20 scores.

| Behavior | OpenSky | Native |
| --- | --- | --- |
| Green slide background | Pass | Fail |
| Duplicate and interleave slides | Pass | Pass |
| Spreadsheet dropdown | Pass | Pass |
| Strikethrough paragraph | Pass | Pass |
| Profit calculations | Pass | Pass |
| Editor find-and-replace | Pass | Pass |
| Editor indentation | Pass | Pass |
| Subscript in H2O | Fail | Fail |
| Split spreadsheet fields | Pass | Fail |
| Fill blank cells | Pass | Pass |
| Sort records | Pass | Pass |
| Create sales chart | Pass | Pass |
| Rename and copy worksheets | Pass | Pass |
| Freeze headers | Fail | Fail |
| Edit slide table header | Pass | Pass |
| Move slide image | Pass | Pass |
| Change slide font sizes | Fail | Fail |
| Center document heading | Pass | Pass |
| Convert text to lowercase | Pass | Pass |
| Change document font | Pass | Pass |

## Matched configuration

SDK `c69d3b8533ffc860759707737e45dc5578466b23`, OpenSky Driver `cfe578ba53afce435486694bcb0048e81f2d9a34`, binary SHA-256 `a0bb400f185094e292507b642c77714ded1361b45c181526385c3fa59a00500a`. Both backends used Terra medium, the same 20 tasks, fresh disposable Linux desktops and documents, matching prompts except public backend API instructions, and the frozen saved-outcome scorer. Codex native compaction was enabled; task deadlines and tool-call caps were absent. No app-specific guidance was added to the OpenSky product harness or skill.

Image `sha256:7643bdb4ffdf5c661a0c88d357985cd884790f74272b993d26ed2e2703032b1f`; code/assets `05b25943c5c469782bcab4d8bfe4b64e04c04f998e63e100b45dead2590beca8`; scorer `985cb748fefedc3958bd1791288bfe51d83f0f7a700ddfae8fd941907b5b553b`. The native reference used the provisioned native screenshot/input service through Codex CLI; it was not a model mock. Its runtime fingerprints and per-arm evidence hashes are retained with the local run artifacts.

The real ramp completed a separate two-task stage (OpenSky 2/2, native 1/2), then five tasks (OpenSky 4/5, native 1/5), before this full 20 run. Every stage used fresh attempts. The earlier five-task duplicate-slide failure remains recorded: the requested final slide order was correct, but an unrelated picture moved upward 1 mm after the agent issued navigation keys while the canvas was focused. The unchanged frozen code passed that task in the full run.

## Runtime and evaluation cost

| Measurement across 20 attempts per backend | OpenSky | Native |
| --- | ---: | ---: |
| Tool calls | 191 | 182 |
| Aggregate agent task runtime | 26.16 minutes | 23.92 minutes |
| Mean agent task runtime | 78.47 seconds | 71.75 seconds |
| Estimated evaluation inference | $7.7691 | $4.1715 |

Total estimated evaluation inference: **$11.9406**. These are API-equivalent estimates for the recorded evaluation usage, not a subscription bill or total project spending. Coding-agent inference and infrastructure are excluded. Aggregate agent runtime excludes desktop preparation, collection, and inter-arm validation; full campaign timestamps are in the machine-readable receipt.

## Retained failures

- **Subscript:** native formatted only the first `2`, while the reference expects all eight occurrences. OpenSky formatted only the first `O`. Separate public controls selected the first `H2O` through either SDK selection or visible Find, then issued the same rapid keys; both formatted `O`. This found no selection-origin difference, but does not rule out a shared key-delivery issue because an independent native same-key control was not run. Both expected-`2` assertions and the initial Find setup failure remain recorded; no frozen failure is reclassified.
- **Freeze headers:** both saved a row-only freeze at A2. The reference requires row 1 plus columns A–B, corresponding to C2. This repeats the documented interpretation mismatch.
- **Slide font sizes:** OpenSky resized individual words rather than entire text boxes. Native retained the original title at 70 pt and formatted a separate tab-only shape at 60 pt; the body became 28 pt. Both saved files fail the whole-textbox requirement.
- **Native-only failures:** the native reference also failed background color and splitting spreadsheet fields. Background scoring requires a specific green shade despite the task saying only “green”; this ambiguity remains disclosed.

No native-only success occurred in this full run. Its three shared failures remain failures, even where interpretation or selection mistakes explain the outcome.

## Reproduction and evidence

The [committed repeat controller](../evals/parity/repeat-vm-campaign.md) owns serialization, dispatch, collection, ramp admission, paired validation, and usage settlement. V15 uses the [committed, byte-identical admission adapter](../evals/parity/adapters/README.md), installed at `work/run-v15-campaign.py` in the retained workspace to admit its new driver pins; it does not change the frozen controller or agent behavior. The current command requires the existing immutable provisioned stage, not a newly provisioned host. Its two setup receipts separately verify office and editor fixtures.

Local retained evidence: `work/v15-smoke-01`, `work/v15-five-01`, `work/v15-full20-01`, and `work/v15-final-review/summary.json`. `work/verify-v15-final.py` performs the read-only final audit without dispatching agents. [Machine-readable measurement](linux-parity-v15.json) contains task IDs, pins, run hashes, outcomes and costs; it does not represent local raw logs as publicly hosted artifacts.

The driver correction independently passed [Linux/Windows canonical and installer CI](https://github.com/tanishqkancharla/cua/actions/runs/34817566624) plus the [real SDK validation described here](linux-unicode-resilience.md). These checks support the Linux Unicode mapping-lifetime fix. Canonical macOS GUI validation, richer native paste, and broader API capabilities remain separate from this fixed Linux measurement.
