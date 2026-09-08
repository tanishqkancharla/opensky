# Paired parity evaluations

Status: the two-task smoke campaign completed with two valid pairs. Both
interfaces passed heading alignment and failed lowercasing. This is a small
paired baseline, not a general parity score. The first five-task campaign
stopped at a false screenshot-program rejection in its third task; that guard
is corrected and the campaign must be rerun.
The [initial smoke results](smoke-results.md) record both attempts per task,
their separate upstream/content scores, cleanup, timing and estimated spend.
Three additional Writer tasks are now pinned for the five-task stage: whole-text
font, H2O subscript, and last-paragraph strike-through. Their original inputs,
gold outputs and unmodified upstream metric functions are included. Separate
guards cover all text/table fonts and per-character formatting, including
partial subscript changes that the upstream metric accepts. All 31 real-file
grader, policy, admission and spending checks pass. The full 20-task set is not frozen yet.

## Run a gated campaign

Local macOS fixtures check desktop readiness before launch and after the task.
A detected screensaver, locked/off-console session or unavailable session state
stops the run as an infrastructure problem; it does not become a task failure.
Unlock/dismiss the screensaver before starting a new campaign. These checks are
best effort and do not continuously monitor the desktop or prevent sleep.

Set `OPENSKY_EVAL_PYTHON`, `OPENSKY_EVAL_LIBREOFFICE`,
`OPENSKY_DRIVER_BINARY` and `OPENSKY_NATIVE_REPL_CONFIG` to the installed local
dependencies. The native config stays outside the repository and results.
From the SDK checkout:

```sh
node --import tsx evals/parity/campaign.ts 2 evals/runs/campaign-smoke
node --import tsx evals/parity/campaign.ts 5 evals/runs/campaign-five evals/runs/campaign-smoke
```

Each destination must be new. Stages 5 and 20 require complete paired evidence
from the preceding stage, verified cleanup and no infrastructure failures.
Real task failures remain scored and do not block the ramp. Interface order is
counterbalanced by task; all desktop use is sequential. A controller stop waits
for the current bounded attempt and its cleanup, then prevents the next launch.
`plan.json` freezes the task manifest; `summary.json` reports valid pairs,
both/native-only/OpenSky-only/neither outcomes, unscored pairs and raw arm data.
Any change in code/assets/desktop fingerprints during a campaign halts it.
Stage 20 refuses to run until `fullTaskIds` contains a frozen 20-task set.

The operator reports progress after every native/OpenSky attempt, including
interruptions: task/backend, outcome, admitted calls and elapsed time, cleanup,
and cumulative conservative spending. Stop before each $50 checkpoint for the
user's review.

Both transports enforce the call/deadline allowance before forwarding to the
actual desktop. An exhausted allowance is a scored task failure when the
dispatch receipt proves the bound; it cannot earn credit from a late saved file.
Missing receipts and unrelated interruptions remain infrastructure failures.
Startup has a separate 60-second limit; the task timer begins at agent dispatch.
Interrupted spending is reconciled only when the terminal turn has no active
calls and its final usage follows the last completed item; otherwise its
reservation remains held for audit.

The user approved a ramp of 1–2 smoke tasks, then five, then a frozen set of
20. Advance when setup, reset, tool isolation and independent outcome scoring
work. A genuine OpenSky task failure is useful evidence; a broken evaluator is
not a task failure. Freeze task IDs and versions before the scored campaign.

Use the same Codex model, reasoning effort, prompt, starting state, action/time
budget and evaluator for both interfaces. The initial configuration is
`gpt-5.6-terra`, medium effort. Report model changes rather than silently falling
back. Native reference, SDK and driver versions belong in every result.

## Suites

- Public-SDK real desktop behavior tests: retain `e2e/`, including native
  selection, paste, document identity, focus, clipboard and exact cleanup.
- OSWorld-Verified: import pinned task instructions/assets/evaluators into a
  disposable supported environment. Do not execute upstream broad process kills
  or global desktop setup on a user's Mac. First validate one or two tasks.
- macOS adaptations: report separately, with source task ID and every changed
  setup/action/evaluator assumption. Linux success does not certify macOS.

The installed native Computer Use service advertises macOS app control. Its
availability in the OSWorld guest remains unverified. No cross-OS comparison is
an equivalent native-versus-OpenSky pair. In-app browser is excluded.

The first two smoke tasks use the original LibreOffice application, DOCX
inputs and upstream metrics: heading alignment (`3ef2b351…`) and lowercasing
all text (`d53ff5ee…`). Full IDs, input hashes and port differences are in
`osworld/manifest.json`, pinned to OSWorld commit `fc31a904…`. The original
metrics do not detect every unwanted change: we additionally compare all
paragraph and table text. Report the upstream score and this guard separately.
The first completed native heading attempt centered the heading but left an
extra leading space, so its upstream score is 1 and guarded task success is
false. It is one attempt, not an overall native performance estimate.
The OpenSky heading attempt observed alignment but did not finish saving; its
upstream score is 0. A separate real-SDK diagnostic confirmed that its observation
omits LibreOffice's separate format-confirmation dialog. That attempt also
failed automatic cleanup; manual recovery is retained separately. See SET-023
and SET-024 in `docs/harness-friction.md`.

LibreOffice and the saved-file scorers also run on Linux/Windows. The added
Linux CI job validates spending, program scope and grading using real DOCX
specimens; it does not yet run LibreOffice GUI agent tasks. Those can use the
same task files and graders under Xvfb, following the existing SDK desktop CI.

Agents receive only their assigned desktop interface. Setup files, evaluators,
expected answers and direct filesystem/HTTP shortcuts are not agent tools.
Scoring checks externally visible outcomes, not the agent's final claim. Keep
original screenshots, tool results, errors, usage and cleanup observations.

## Programmatic Codex startup

`codex exec` works noninteractively, but 0.147.0 declined the native service's
MCP app-access elicitation. Merely enabling the installed plugin also did not
expose its tool in the initial probe. The explicit published MCP launcher
initialized successfully outside the parent shell sandbox.

The runner uses the same installed CLI's `app-server` stdio protocol, whose
documented client interface handles MCP elicitations. Accept only the exact
already-authorized app-access form for the current tool call and target. Never
accept arbitrary forms, URL authentication, shell escalation or persistent
permission requests automatically. Record all decisions. New authorization
needs stay visible to the user.

Scored document runs admit straight-line public UI calls for the owned app.
The transport validates these before execution. Both arms retain their real
REPL and public SDK. Native documentation is supplied explicitly because a
standalone MCP connection does not load the plugin skill automatically.
Native screenshot reading is allowed only through the returned screenshot URL;
document filesystem shortcuts remain unavailable. Unsupported programs are
infrastructure errors, not task failures.

## Spending

The user requires review before crossing each cumulative $50 increment, across
all evaluation runs and infrastructure. The current runner reserves $5 of
conservative Terra API-equivalent estimated cost and interrupts at $2.50 of
reported usage, leaving headroom for in-flight work. This is an estimate-based
admission guard, not a provider-enforced billing cap. Interrupted runs retain
their reservation until reconciled. Approval advances one checkpoint only.

Initial preflights use the existing ChatGPT login, with API-key environment
variables excluded. Record actual token usage and subscription authentication
separately from cash expenditure; do not call subscription usage free or invent
an API dollar charge. Rates and official sources are recorded in `pricing.json`;
the ledger uses the higher long-context standard rates. API-billed and paid
infrastructure dispatch remain disabled. The first checkpoint is $50.

## Local cleanup

Cleanup is required even when the agent errors, times out, or needs permission.
The Calculator preflight starts its own app through Launch Services, records its PID, bundle
ID and launch time, and normally quits that exact process in fixture teardown.
It verifies exit independently and writes `cleanup.json`. A cleanup error fails
the preflight and prevents ramping up. An already-running Calculator blocks
setup so the native bundle selector cannot target the user's instance.
`-ApplePersistenceIgnoreState YES` is supplied only to the fixture process to
avoid restoring older windows; no persistent preferences are changed. The
lifecycle helper is not available to the evaluated agent. Optional diagnostic
AX inspection uses existing access and never prompts for a grant. LibreOffice
uses a fresh disposable profile with `--norestore` and a per-process
`PYTHONDONTWRITEBYTECODE=1` to avoid an observed embedded-Python startup hang.
If normal quit is blocked by unsaved edits, only an explicitly disposable
profile process may receive SIGTERM, after its exact identity is rechecked.
Saved documents are scored before teardown; teardown cannot earn task credit.
Temporary compiler caches and the lifecycle helper are removed after each run;
ownership, result and cleanup records are retained as evaluation evidence.
`run-status.json` gates evaluation validity on infrastructure success, verified
app exit and scratch removal, separately from `score.json` task outcomes.

Document tests must retain files until their owned windows are closed, then
quit owned app processes and remove temporary documents. The existing native
SDK fixtures currently close exact windows but still need process teardown;
do not run them locally until that lifecycle is added. Historical TextEdit
and Calculator leftovers were normally quit and their exits verified on
2026-09-07. Unrelated user applications were preserved.

## Reporting

Report absolute task success for each arm, both/native-only/OpenSky-only/neither
outcomes, repeated-run variability, infrastructure errors, and unrun tasks.
Compare time, tool calls and tokens on tasks both arms completed. Keep SDK
behavior coverage separate from agent task success. Wrong-target edits,
clipboard corruption and cleanup failures must remain visible regardless of
aggregate success. A small smoke set is not an overall parity percentage.
