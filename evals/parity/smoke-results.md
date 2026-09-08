# Initial smoke characterization — 2026-09-07

Two OSWorld tasks were attempted with Terra medium through each real interface.
These runs found a reproducible OpenSky observation gap. They do not establish
an overall parity percentage, and the first heading pair is not a valid clean
baseline because OpenSky teardown failed. No five- or twenty-task campaign has
run yet.

| Task / interface | Upstream score | Full-text guard | REPL calls | Agent elapsed | Automatic cleanup |
| --- | ---: | --- | ---: | ---: | --- |
| Center heading / native | 1 | Fail: extra leading space | 8 | 68.4 s | Passed |
| Center heading / OpenSky | 0 | Pass: original text retained | 3 | 91.8 s | Failed; recovered separately |
| Lowercase / native | 0 | Fail: other paragraphs retain uppercase letters | 12 | 99.6 s | Passed |
| Lowercase / OpenSky | 0 | Fail | 10 | 82.4 s | Passed using disposable-process fallback |

The heading task's upstream metric checks alignment only. The native result
centered the heading but added a space. The lowercase task's upstream gold
requires all document text to be lowercase; the native agent changed the
all-uppercase instruction paragraph, leaving other mixed-case paragraphs.
These are saved-document outcomes, regardless of final agent claims.

The OpenSky heading agent observed Center enabled, clicked Save, then received
`No accessibility changes.` Its saved DOCX was unchanged. An independent real
SDK diagnostic reproduced this while native AX showed LibreOffice's separate
format-confirmation window. SET-023 records the evidence and pending work.
The original document binding remains valid but omits the new top-level dialog.
`DIALOG-N01` is the public-SDK regression for this observation gap.

The local environment was macOS 15.7.9, LibreOffice 26.8.0.3, Codex CLI 0.147.0,
SDK checkout based on `448a807a`, and the existing permissioned OpenSky Driver
runtime from `aa31c70ee`. The task manifest pins original assets and evaluator
source to OSWorld `fc31a904`. The harness was being refined during these runs;
new per-run fingerprints and a frozen harness are still needed for a baseline.

Each arm used the same original task instruction, save/preservation constraints,
240-second time limit and 20-REPL-call limit. REPL calls can batch different
numbers of UI actions, so this is not a matched primitive-action budget. Tool
documentation differs appropriately by interface. Record primitive actions
separately before comparing action efficiency.

All task attempts above completed without a runner interruption. Earlier
startup/program-scope interruptions remain separate infrastructure probes.
Raw `events.jsonl`, `score.json`, saved documents and original cleanup reports
remain locally under the correspondingly named `evals/runs/osworld-smoke-*`
directories. The heading cleanup failure was not rewritten as a pass.

At this checkpoint the ledger totals **$1.5521256 in conservative Terra
API-equivalent estimates**, with no unsettled reservations. Actual workspace
credit billing is unavailable. The user's next review threshold remains $50.
Sixteen budget/policy/real-DOCX grading checks and TypeScript validation pass;
those are harness validation, separate from GUI acceptance.

## Save-dialog fix and reruns

App-scoped observations now follow the bound process's frontmost ordinary
window using fresh stacking evidence. Existing exact document handles remain
bound to their original window. Three real public-SDK regressions verify the
format dialog, successful saving and simultaneous exact-document observation
(SET-025). The existing permissioned driver was unchanged.

| Task / interface | Upstream score | Full-text guard | REPL calls | Agent elapsed | Automatic cleanup |
| --- | ---: | --- | ---: | ---: | --- |
| Center heading / OpenSky rerun 2 | 1 | Pass | 6 | 106.57 s | Passed normally |
| Lowercase / OpenSky rerun 2 | 0 | Fail | 11 | 148.03 s | Passed normally |

Both reruns saved the DOCX and have valid cleanup/scratch-removal receipts.
The lowercase failure remains a task failure. These targeted reruns are not a
new matched native comparison. At this checkpoint the cumulative conservative
estimate is **$2.0151012**, with no unsettled reservations and a $50 review
threshold. The expanded harness passes 24 budget/policy/document-grading checks;
the gated two- then five-task campaign remains to be run.

## Frozen smoke campaign 2

`campaign-smoke-2`, SDK/harness `1dc22f6`, completed all four attempts with
stable fingerprints, bounded transport receipts, verified process liveness
before teardown, and successful cleanup/scratch removal.

| Task / interface | Guarded task result | Admitted calls | Agent elapsed | Cleanup |
| --- | --- | ---: | ---: | --- |
| Heading / native | Pass | 3 | 24.52 s | Normal quit |
| Heading / OpenSky | Pass | 5 | 42.33 s | Normal quit |
| Lowercase / OpenSky | Fail | 11 | 110.21 s | Verified disposable-process fallback |
| Lowercase / native | Fail | 11 | 90.89 s | Normal quit |

Both interfaces succeeded on 1/2 tasks; the pair outcomes were one **both pass**
and one **neither pass**. Two tasks do not establish general parity. Cumulative
estimated evaluation spend after this campaign was $3.6283252.

The first five-task campaign then completed the heading pair (both pass) and
lowercase pair (OpenSky pass/native fail). Native's font attempt was interrupted
by a guard that rejected an equivalent inline screenshot import. That third
pair remains unscored and the campaign incomplete. SET-032 records the fix and
the audited cumulative estimate of $5.1207228. Original artifacts remain intact.

Five-task campaigns 2 and 3 also halted on evaluator restrictions, before a
complete five-task comparison. Campaign 2 rejected an invented OpenSky method
before dispatch instead of letting the SDK return its normal error (SET-033).
Campaign 3 rejected reassignment of a native observation variable (SET-035).
Campaign 3 recorded heading passes for native (4 calls, 29.27s) and OpenSky
(5 calls, 42.84s), and an OpenSky lowercase pass (11 calls, 97.36s). The native
lowercase attempt remains invalid. Every owned process was alive before normal
teardown and scratch removal passed. These partial campaigns do not replace the
completed two-task baseline. Audited cumulative estimate: $5.8728044.

Campaign 4 completed four valid pairs on `390d3e7`: heading native pass/OpenSky
fail; lowercase OpenSky pass/native deadline failure; font both fail; subscript
both fail the complete-format guard despite upstream scores of 1. Native's final
strikethrough arm was invalidated by another screenshot-import restriction
(SET-036). Eight valid attempts remain measured evidence; the ninth is excluded.
The final pair will be completed separately, with revision provenance retained.


## Verified five-task readiness checkpoint

`evals/runs/five-task-readiness-checkpoint` contains five valid pairs. It keeps
all eight valid campaign-4 attempts, including every failure, and adds both
separately completed strikethrough arms. SDK/driver/app/model versions and
limits match; evaluator guards changed across `390d3e7`, `08f7e4e` and `d7fe97b`.
The assembly audit checks source hashes, runtime fingerprints, sequential calls
and the narrow guard-only differences. This is a readiness checkpoint across
revisions, **not a single frozen campaign** and not a general parity percentage.

| Task | Native | OpenSky |
| --- | --- | --- |
| Center heading | Pass | Fail |
| Lowercase all text | Fail: deadline | Pass |
| Times New Roman throughout | Fail | Fail: call limit |
| H2O subscript | Fail: incomplete formatting | Fail: incomplete formatting |
| Strike through final paragraph | Pass | Fail |

Native succeeded on 2/5 and OpenSky on 1/5. There were two native-only successes,
one OpenSky-only success and two neither-pass pairs. No pair had both succeed
in this checkpoint. This small Writer-only set is a ramp validation, not broad
capability coverage. It clears the five-task readiness stage; the 20-task
campaign remains pending until the expanded fixtures are validated and frozen.

The final native arm used 9 calls/106.43s; OpenSky used 4 calls/103.22s. Both
quit normally and removed scratch files. The preceding invalid OpenSky attempt
exposed a 60-second paragraph-selection timeout and a poisoned REPL (SET-037);
its later guard rejection does not erase that SDK failure evidence. Across the
checkpoint sources, the app was alive before teardown in every case. No
unexpected LibreOffice exit was observed. Cumulative conservative estimated
spend is $9.2695744, with no outstanding reservations at this checkpoint.

## Expanded setup validation (2026-09-07)

All 15 added task files passed real app setup: eight Calc, five Impress and two
VS Code. Each owned process stayed alive until normal teardown, quit normally,
and had its temporary profile removed. No unexpected LibreOffice exit was
observed. `evals/runs/expanded-setup-validation.json` retains source paths and
hashes. The first Calc probe failed before app launch because the VS Code
fingerprint assumed the executable name Electron; the bundle metadata now
supplies the actual name Code, and the retained second probe passed.

The manifest now freezes 20 task IDs. All 72 harness/file-grader tests and
TypeScript checks pass; the 40 source assets pass SHA-256 verification. These
are setup and evaluator results, not agent completion scores. The full paired
campaign is still pending. No model evaluation ran during these setup checks;
the cumulative conservative API-equivalent estimate remains $9.2695744.

## First frozen 20-task attempt — stopped (2026-09-07)

`campaign-full-1` at SDK/evaluator `8342e36` passed both heading arms: native
6 calls/45.49s, OpenSky 6 calls/99.69s. OpenSky lowercase was interrupted after
7 admitted calls/75.02s by the evaluator rejecting reassignment of its existing
authorized app binding. That arm is invalid and the campaign stopped; 19 pairs
remain unscored. All three apps stayed alive until normal cleanup and all scratch
profiles were removed. The rebind guard is corrected in SET-040, with 21 focused
checks and TypeScript validation passing. Interrupted usage is audited and
settled; cumulative conservative estimate $9.7611836. A fresh full campaign is
required. Earlier valid and invalid artifacts remain intact.
