# Paired parity evaluations

The active objective is remote Linux parity; see
[the Linux plan](../../docs/linux-parity-plan.md). The first fixed-software
20-task baseline is complete (native 18/20, OpenSky 14/20). A separate frozen
correction campaign completed the same twenty tasks after its smoke/five-task
ramp: OpenSky16/20 and native14/20, with one native-only font-editing success.
The fresh release-build campaign is in its five-task ramp; its results stay separate.
Current counts come from retained campaign artifacts and the live scorecard.
Historical mixed-revision macOS readiness results remain in
[smoke-results.md](smoke-results.md); they are not Linux parity evidence.

The set contains five Writer, eight Calc, five Impress and two VS Code tasks.
Upstream scores are retained alongside stricter saved-content/format checks and
the frozen Impress export profile. Setup, deterministic SDK behavior and agent
task success remain separate kinds of evidence. The local macOS commands below
are reference documentation; do not run them during the Linux-first phase.

## Run a gated campaign

Local macOS fixtures check desktop readiness before launch and after the task.
A detected screensaver, locked/off-console session or unavailable session state
stops the run as an infrastructure problem; it does not become a task failure.
Unlock/dismiss the screensaver before starting a new campaign. These checks are
best effort and do not continuously monitor the desktop or prevent sleep.

Set `OPENSKY_EVAL_PYTHON`, `OPENSKY_EVAL_LIBREOFFICE`,
`OPENSKY_DRIVER_BINARY`, `OPENSKY_EVAL_VSCODE` (for the expanded set), and
`OPENSKY_NATIVE_REPL_CONFIG` to the installed local
dependencies. The native config stays outside the repository and results.
New campaigns also require `OPENSKY_EVAL_SCORING_PROFILE`, pointing to a frozen
`profile.json` prepared from passing real-export controls. See
[`impress-grading-validation.md`](../../docs/impress-grading-validation.md) for
preparation commands. The campaign LibreOffice variable selects the `.app`
bundle; the exporter test and profile preparation commands select `soffice`.
Use Python 3.12 for the combined grader environment. A date-cell probe crashed
under Python 3.14 with pandas 2.2.3; the same pinned dependencies passed under
3.12. From the SDK checkout:

```sh
python -m pip install -r evals/parity/osworld/requirements.txt
python evals/parity/osworld/fetch-assets.py
node --import tsx evals/parity/campaign.ts 2 evals/runs/campaign-smoke
node --import tsx evals/parity/campaign.ts 5 evals/runs/campaign-five evals/runs/campaign-smoke
node --import tsx evals/parity/campaign.ts 20 evals/runs/campaign-full evals/runs/campaign-five
```

Each destination must be new. Stages 5 and 20 require complete paired evidence
from the preceding stage, verified cleanup and no infrastructure failures.
Real task failures remain scored and do not block the ramp. Interface order is
counterbalanced by task; all desktop use is sequential. A controller stop waits
for the current attempt and its cleanup, then prevents the next launch.
`plan.json` freezes the task manifest and scoring profile; `scoring/` retains
the verified reference copies. Stages must use the same scoring and task-limit
profiles. `summary.json` reports valid pairs,
both/native-only/OpenSky-only/neither outcomes, unscored pairs and raw arm data.
Arm results retain original and adapted grades separately; summaries include
`rawNativeSuccesses` and `rawOpenskySuccesses` alongside primary success counts.
Any change in code/assets/desktop fingerprints during a campaign halts it.
Stage 20 refuses to run until `fullTaskIds` contains a frozen 20-task set.

A readiness checkpoint assembled across evaluator revisions must retain source
paths, evidence hashes, compatibility audits and all valid failures. It cannot
be relabeled a frozen baseline. The subsequent 20-task campaign still enforces
a single code/assets/desktop fingerprint.

The operator reports progress after every native/OpenSky attempt, including
interruptions: task/backend, outcome, admitted calls and elapsed time, cleanup,
and cumulative conservative spending. Stop before each $50 checkpoint for the
user's review.

The default `native-compaction-v1` profile has **no whole-task deadline and no
tool-call cap**, as requested by the user. Both arms run through the real Codex
app-server with its normal native context compaction; the harness does not
summarize context, restart the agent, or override compaction thresholds. Calls
and elapsed time are observations, not completion gates. Spending reservations,
the existing per-run estimate safety threshold, and each $50 review checkpoint
still apply. Startup and process teardown retain separate transport timeouts;
these do not limit the working agent's task duration.

Historical `fixed-v1` results used 20 calls / 240 seconds and must remain
separate from uncapped results. Pass `fixed-v1` as the final optional argument
only for an explicit historical replay. Run profiles are recorded with every
new attempt and campaign. Both transports require explicit arming after the
spending reservation, even when deadline and max calls are null. A historical
exhausted allowance is a scored failure only with its dispatch receipt; missing
receipts and unrelated interruptions remain infrastructure failures.
Interrupted spending is reconciled only when the terminal turn has no active
calls and its final usage follows the last completed item; otherwise its
reservation remains held for audit.

The user approved a ramp of 1–2 smoke tasks, then five, then a frozen set of
20. Advance when setup, reset, tool isolation and independent outcome scoring
work. A genuine OpenSky task failure is useful evidence; a broken evaluator is
not a task failure. Freeze task IDs and versions before the scored campaign.

Use the same Codex model, reasoning effort, prompt, starting state, run profile
and evaluator for both interfaces. The initial configuration is
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

The Linux workflow now runs the pinned genuine native Linux runtime and the
OpenSky SDK on separate disposable Ubuntu desktops. The native screenshot and
keyboard interface differs from the macOS app interface; its usage guide is
[`native-linux-guide.md`](native-linux-guide.md). Matched Linux pairs retain the
native package hash, driver hash, application versions and task/scorer hashes.
No cross-OS comparison counts as an equivalent pair. In-app browser is excluded.

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

LibreOffice and the saved-file scorers also run on Linux/Windows. The current
[`linux-agent.yml`](../../.github/workflows/linux-agent.yml) workflow runs real
LibreOffice and VS Code GUI agent tasks on Ubuntu under Xvfb. Its `setup`,
`repl` and `agent` modes separate environment readiness, deterministic public
interface controls and paid task completion. Agent mode requires an existing
cumulative-budget reservation bound to the source revision; setup and repl
results do not count as agent passes. The frozen campaign workflow pins the
exact driver binary, native package and adapted scoring profile artifacts.

Agents receive only their assigned desktop interface. Setup files, evaluators,
expected answers and direct filesystem/HTTP shortcuts are not agent tools.
Scoring checks externally visible outcomes, not the agent's final claim. Keep
original screenshots, tool results, errors, usage and cleanup observations.

Expanded assets are fetched from the original URLs and checked against the
manifest SHA-256 pins; large workbooks/presentations are not embedded in Git.
The original task JSON and metric-source provenance are retained. Setup uses
real LibreOffice Writer/Calc/Impress and a separate stable VS Code installation.
VS Code uses an empty user-data directory, no installed extensions, and disabled
updates/telemetry in that disposable profile. See the [official CLI isolation
options](https://code.visualstudio.com/docs/configure/command-line#_isolating-vs-code-instances).
Each agent sees its actual operating system and saves its own file in the
original format. Original upstream global setup, process killing and save
post-actions are not executed. These profiles exclude clipboard workflows; the proposed
transpose task is deferred to a future isolated-desktop profile, and was
replaced before expanded agent results by the split-field task.

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

VS Code reference discovery uses the exact workspace-owned installation path:
its bundle ID may be shared by unrelated extension-test copies. Both backends
receive the same path selector. App-launch readiness alone does not prove that
either agent's public discovery interface can bind that installation. The first
real path probe passed natively and exposed a driver inventory/launch-path gap
in OpenSky; keep that gap visible until a real SDK probe passes.

Before launching an OpenSky fixture, `driver-runtime.json` records a read-only
`check_permissions` response from the socket that will receive actions. Its
daemon-attributed executable must resolve to `OPENSKY_DRIVER_BINARY` and have
both macOS permissions. Set `OPENSKY_DRIVER_SOCKET` when selecting an isolated
candidate; that socket is forwarded to the agent transport, which repeats the
identity check at startup. A mismatch or unavailable identity blocks dispatch
before app setup or spending. Do not update an executable in place while its
daemon is running: path verification does not identify already-loaded bytes.
The current runtime attribution check is macOS-specific, like this local
OSWorld harness; other platforms need their own authoritative runtime identity.


## Impress reference compatibility audit

Historical image movement failed the raw upstream grader despite satisfying the
position rule. A no-edit export by the provisioned LibreOffice also fails the
neutral raw-reference comparison. Raw historical scores
remain preserved; no new paired success rate is inferred from the diagnostics.

Run the read-only artifact audit with the provisioned Python environment:

```sh
python evals/parity/osworld/audit_impress_export.py \
  --task 2b94c692-6abb-48ae-ab0b-b3e8a19cb340 \
  --libreoffice /path/to/LibreOffice.app/Contents/MacOS/soffice \
  --output /path/to/new-audit-directory \
  --actual /path/to/agent-saved-presentation.pptx
```

This exports reference/input copies through the real headless application, with
private profiles and verified process cleanup. It never exports or repairs the
agent's file. Results retain original grader options and separate raw scores
from exported-reference diagnostics. This audit defaults to exported upstream
references; `--reference-policy task-preserving-export-v1` additionally derives
the duplicate-slide reference from the preserved input because upstream gold
changes unrelated earlier slides. All five independently constructed completions
and twenty negative controls passed their expected grading checks. The frozen
profile integration validates hashes and the exporter before dispatch, and
retains original grades separately. Fresh matched agent smoke runs remain
pending; these file controls do not establish desktop parity.
