# Historical Linux parity milestones

Archived from linux-parity-plan.md on 2026-09-10. These entries describe past
checkpoints, including then-current next steps and budget limits. They are not
instructions to dispatch jobs or authoritative current status. All raw evidence
and failed attempts remain preserved. See linux-parity-plan.md for the active plan.

## Priority update — 2026-09-09

Behavioral parity takes precedence over speed differences. Continue to report
elapsed time, calls and context, but do not gate broader matched task coverage
on small performance improvements. Fix a performance issue when it is clearly
large enough to impair the experience or prevent useful iteration. Keep source
and scoring comparability; do not change task expectations to obtain passes.

Next, broaden paired agent coverage to VS Code and Impress on the accepted
configuration. The latest Calc pair is native pass / OpenSky fail: all requested
values match, but 18 extra intermediate cells violate whole-sheet rules. The
metadata batching candidate passed three real Calc saved-outcome checks and
nine observation comparisons (owned document URI excepted), but remains outside
the accepted paired configuration; further speed tuning is parked.

The custom driver builds currently use Rust's development profile while the
canonical shipping workflow uses release. Historical timing measurements remain
valid for the tested build, but release performance is unmeasured. This caveat
must not be confused with a task-success result or used to postpone coverage.

The first VS Code pair completed on accepted SDK8c818c7 / driver4863e5b:
native32 (CI34409909946) and OpenSky33 (CI34410305380) both passed replacing
“text” with “test”. Both retained saved files exactly match frozen gold, all
cleanup/usage receipts passed, and all compared fingerprints match except the
Ubuntu patch label. This establishes one editor task, not broad editor parity.
Native16.805s/5calls and OpenSky37.595s/7calls remain secondary metrics. Evidence:
`evals/runs/campaign-linux-smoke-1/code-replace-pair.json`.

The first Impress pair also completed on the same accepted software: OpenSky34
(CI34410676094) and native35 (CI34411170884) both passed making slide1 green.
Both saved backgrounds are reference color00a933, raw and adapted full graders
passed, and cleanup/usage receipts passed. Native23.070s/8calls versus
OpenSky82.821s/7calls is secondary. Evidence: impress-background-pair.json.

The next fixed-software20-task index reuses all eligible8c results, including
the Calc failure, and excludes older SDK results from its aggregate. This is
an additive evidence index, not an identical-environment campaign: retained
Ubuntu labels differ24.04.4/24.04.5, so the strict desktop-fingerprint freeze in
campaign.ts remains unmet. Preserve that limitation and all raw evidence. The
next untested item in committed fullTaskIds is Calc fill-blanks01b269ae, with
native first according to the already frozen counterbalancing order.

The historical notes below describe earlier gates and may have been superseded;
the live campaign artifacts are authoritative for current run status.

## Current evidence and next gate (2026-09-10)

The frozen software baseline is in `evals/runs/linux-baseline-8c818c7` with an
immutable 20-task plan. All twenty pairs are complete (native 18 passes, OpenSky
14). Four native-only successes are profit, dropdown validation, strikethrough
and freezing headers; two tasks failed on both. This is a single-run baseline,
not a repeatability estimate. Calc, Impress, Writer and
VS Code task setup/scoring have all been admitted and used in real agent runs.
Some earlier pairs differ in Ubuntu point-release labels; this is a frozen
software campaign, not proof of one identical environment throughout.

After the baseline, preserve its failures and run corrections separately.
Selection is a concrete native-only gap on Writer strikethrough: native struck
all 387 target characters, OpenSky none after two selectText refusals. A no-model
public SDK regression reproduces the same refusal. The isolated driver/SDK
candidate624 now builds on Linux and passes all eight focused real SDK
selection, caret, formatting and window/token guard behaviors. Earlier failed
candidates and fixture failures remain retained. Coincident maximized-window
identity and concurrent-client races remain limitations. The next measurement
is a separate matched strikethrough comparison, followed by dropdown validation
if the first pair is valid. The earlier
indexed editable-field click fix has supporting real SDK evidence but has not
yet been measured in a matched agent retry. Profit failure is extra agent edits,
not evidence of failed input; see the retained trace and saved-cell diagnosis.

GitHub-hosted paid evaluations and one-off owned Docker tests on the authorized
exe.dev VM are working. No persistent runner registration is needed. Keep local
macOS GUI unused during this phase. Authoritative current run, ledger and live
page evidence supersede the historical milestones below.

## Historical milestones (retained for provenance)

- The deterministic Linux desktop gate passed for both backends in run
  34274308972, including the real native Node REPL screenshot transport,
  heading/save outcomes, verified process exit and temporary removal.
- Candidate c26ec3aa680486c60147aa53d79b9e068750aa0d has two completed
  successful agent pairs: heading and lowercase. Evidence lives in
  `evals/runs/campaign-linux-smoke-1`, including saved files, scores, tool
  traces, complete usage and environment fingerprints.
- Heading runtime fingerprints match. Lowercase differs in Ubuntu point-release
  labels (24.04.4 / 24.04.5); kernel, apps and evaluation runtime fingerprints
  match. Retain this difference when interpreting the comparison.
- OpenSky took 92.365 s / 7 calls versus native 14.705 s / 4 calls for heading;
  240.536 s / 18 calls versus 40.834 s / 10 calls for lowercase. Investigate
  observation latency and a stale save-dialog element token after the baseline.
- The five-task ramp is complete: native 4/5, OpenSky 3/5. Font is the one
  native-success/OpenSky-failure gap; both agents changed only the title for
  subscript, while the reference expects eight occurrences. Both passed strike.
  The selected native/OpenSky font, subscript and strike pairs used ed4fe66 and
  matching runtime fingerprints; strike has the same Ubuntu label difference
  as lowercase. First two pairs used c26ec3a. Preserve this version distinction.
- `five-task-baseline-summary.json` preserves the original selected run history.
  The matched font retry on SDK 16e62c1 and driver 00e3b936e still failed with
  OpenSky (427.893 s / 24 calls) and passed with native (87.823 s / 18 calls).
  All fingerprints matched. Evidence: font-fixed-pair.json, runs 34288468049
  and 34289296019. The five-task rates remain native 4/5 and OpenSky 3/5.
  Accounting after those turns: $74.5640524, no active reservation.
- The combined modifier, Unicode timing and sparse-index candidate passed
  nine real checks across three GitHub desktops, and three more checks on
  exe.dev. Earlier Unicode intermittence remains documented. A new real
  dialog-coordinate regression failed on the same driver; candidate cf83a6692
  restricts AT-SPI hit-testing to the requested window. Three-desktop run
  34289751231 is pending. These deterministic checks are not agent scores.
- Full twenty-task support remains unfinished: install and validate Linux Calc
  and Impress, implement the real VS Code task fixture, verify reset/cleanup
  and scoring for each category, then freeze that environment for paired runs.
  The current worker rejects VS Code explicitly; do not silently omit those tasks.
- User-provided exe.dev host is reachable with the correct account. Official
  runner files and dependencies are installed. Persistent runner registration
  and service startup await explicit approval after automatic review rejected
  that expansion of future job access. Hosted evaluations and authorized
  one-off Docker tests work without it; registration is optional, not a blocker.
- Preserve macOS driver follow-ups for later; historical macOS results do not
  count as Linux evidence.


## Fixed-software index and continuing the20-task set

`evals/runs/linux-baseline-8c818c7/plan.json` was frozen additively after arms30–35
with SHAecd69e4df775175f986e17484fd54c859513e2922084ceadb2433b15f6052827.
It records the committed20-task manifest, exact software/runtime fingerprints,
Terra medium with native compaction, scoring profile, imported evidence and
selection policy. Select the first valid arm per task/backend by CI run ID,
including failures; retain later attempts separately rather than replacing a
failure. Raw source artifacts remain in campaign-linux-smoke-1.

`work/refresh-linux-baseline.py` verifies raw CI/admission/result/score/cleanup,
configuration, model, app and driver fingerprints, then refreshes only the
additive summary. The current index contains all six imported arms:3/20 pairs,
native3passed/OpenSky2passed. The public status view now selects this index and
marks older-build Writer tasks as not yet run on this build. Those historical
scores remain preserved. The index is explicitly a fixed-software comparison:
Ubuntu patch labels differ; strict identical-environment freeze remains unmet.

Continue per-arm finalization and accounting through the existing helpers, then
refresh the baseline and status narrative. Keep accepted main SDK8c818c7 fixed
for this index. Native36 is dispatched for Calc fill-blanks01b269ae as the next
item in fullTaskIds; OpenSky37 follows after valid completion/reconciliation.
No whole-agent deadline or tool-call limit is introduced. Current cumulative
settled estimate is$86.2227098, with$5 reserved for native36, within$100 approval.
