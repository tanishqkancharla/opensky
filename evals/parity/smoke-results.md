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
