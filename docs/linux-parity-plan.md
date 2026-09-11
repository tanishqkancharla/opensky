# Linux parity plan

Current scope, 2026-09-11: measure and improve native Computer Use versus OpenSky
on isolated remote Linux desktops. The user's Linux-first direction supersedes
the earlier macOS-first sequencing; the broader goal remains incomplete.
Do not launch local macOS GUI tests in this phase. Exclude Codex's in-app browser.

## Measurement and execution

Use genuine native Linux `@oai/sky` and OpenSky's public SDK, driven by matched
Codex CLI Terra agents at medium effort. Both receive the same task, original
assets, disposable app setup and saved-outcome grading. Their public observation
and input interfaces differ; that difference is what the evaluation measures.
No mocks, task-specific repair of outputs, or model-authored grading decisions.

Each evaluation version uses the same frozen20 tasks: Calc, Impress, Writer and
VS Code. Freeze source, driver bytes, native package, task/scoring definitions,
model/settings and recorded environment identities. Start1–2, then5, then20 after
setup/readiness, real input, grading and cleanup gates. Widening task coverage on
unchanged software stays in the same version; changed software/settings starts a
new version. Retain earlier first outcomes and failures. A setup failure before
agent admission is unscored, not a task failure or a free retry of a valid result.

The main per-backend success rate is passed/completed. Completed includes valid
passes and failures, excluding unrun, active and unscored attempts. Every version
shows all20 tasks and their separate states. Paired comparisons and effort
averages require both selected outcomes with matching fingerprints. Report the
native-only and OpenSky-only successes separately: equal aggregate rates or two
failures do not establish behavioral parity. Incomplete versions and one pass per
task do not establish repeated-run reliability or universal desktop coverage.

Agent runs use native compaction with no whole-task deadline or tool-call limit.
Spending controls remain independent: the cumulative approved ceiling is$200,
with a concrete case and user check-in before any next$50 increment. The ledger
at `evals/runs/parity-budget.json` is authoritative; estimated/reserved dollars
are conservative accounting, not an invoice. Give an update after each run.

## Current evidence

- Historical V1: `campaign-linux-release-candidate/full20-selection.json` freezes
  SDK2d8879f and driver403/e655. All20 pairs completed: OpenSky17/20, native15/20.
  It is a single-run software baseline; retained Ubuntu point-release variation
  prevents claiming one identical machine environment throughout. Do not replace
  V1 outcomes with results from later fixes or retries.
- Active V2: `campaign-linux-calc-pointer-candidate/full20-selection.json`,
  SHA256`7b5c528298ea0aba6eee693d34ab5dcd46e96e523e01433a4e0f8ef3bb77d7fa`,
  pins SDK`fcd01bb0a12a9004c83407bb26549e7ae7401025`, driver source
  `ed9fd15e39a1d2acd07c4f3078440c3ab2ad44f2` and binary SHA256
  `8b50bfbdbd9c98aaa5d0ff9d4f2196b18115b96fe6c2d68847ddb16c21ce6692`.
  This measures the Calc pointer correction separately from V1. Its validated
  five-pair ramp was adopted additively into the20-task selection. Full20 remains
  in progress; read retained artifacts and the live scorecard for current counts.
- Both use native package SHA256`2caa7df314ce37e9048359d8e6a4a78e24574a3b54d6bf510f17754b66dda775`
  and grading profile`b273feecbe566519f2c547c4329f8fe7f033c80a416a0715db40d2c060fd0bc5`.
- The original V2 font08 stopped on an HTTP429 before admission. Its terminal
  proof and zero-cost reconciliation are retained. The additive declared
  first-agent recovery failed validly by inserting a title newline; that failure
  remains selected. Never reuse its original one-use spending envelope.
- Real SDK controls on exact V2 runtime reproduced the newline after indexed and
  coordinate clicks followed by Enter. Omitting Enter permits a saved bold edit
  with all22slide text unchanged. The three finalized characterization tests pass;
  they do not establish an indexed-only driver bug or change the paid score.
- A V2 background result exposes a task/rubric mismatch: native applied green
  but the exact reference requires a shade absent from the prompt. Its strict
  failure remains recorded and flagged; it is not a native capability failure.
  Any prompt/rubric correction belongs to a separately declared future version.
- Later popup-capture driver work and the validated exact-manifest asset cache
  are separate future candidates. The cache's cold/warm setup runs verify40
  assets with32/0downloads, original input preservation, full grading checks and
  cleanup, without model admission. Do not adopt either change mid-V2.

## Next gates and evidence ownership

Continue the existing serial full20 controller; never duplicate an active arm.
A specific live process/session or authoritative CI state establishes liveness.
Observation timeout is not terminal. At each completed arm, verify saved user
outcomes, task score, exact source/environment, complete usage and owned app/temp
cleanup. Then settle accounting and update the selected pair and scorecard.
Final evidence must cover all20 declared pairs, not only a headline percentage.

After full20, inspect every native-only failure and any wrong-target, corruption,
observation or cleanup issue. Attribute failures using real consumer controls;
agent mistakes are not automatically driver bugs. Implement supported fixes on
separate sources, validate them with real SDK behavior, then run matched tasks
again under a predeclared selection while preserving first outcomes. Report
remaining gaps and variability honestly; no formal statistical noninferiority
threshold has been established by the current single-run protocol.

GitHub-hosted agent evaluations and one-off Docker desktops on the authorized
exe.dev VM work. Persistent runner registration is optional and unnecessary.
Cleanup only owned apps, processes, profiles and temporary documents; retained
artifacts remain evidence. Linux acceptance does not certify macOS, Windows,
browser/provider APIs or every capability in `driver-followups.md`.

The read-only live scorecard's `versions.json` selects V1/V2, keeps all20 rows,
and rejects mixed source evidence. Internal SDK work and cleanup notes stay out
of its end-user metric summaries. Prior planning milestones are preserved in
[historical notes](linux-parity-history-20260911.md); their old pending states and
budget amounts must not drive new actions.
