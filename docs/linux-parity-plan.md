# Linux parity objective

Updated by user direction on 2026-09-08. This supersedes the macOS-first portion
of the existing goal. The goal API currently cannot edit objective text.

Achieve and measure native Computer Use versus OpenSky parity on isolated remote
Linux desktops. Use GitHub-hosted runners where they work; use exe.dev only if
the required desktop/runtime or iteration workflow cannot run reliably in CI.
Do not launch further macOS GUI tests during this phase.

Use the genuine native Linux runtime and OpenSky's public SDK against the same
apps, task assets and independent saved-outcome graders. Run matched Terra
agents at medium effort. Keep deterministic experience tests separate from
agent scores, and setup/capture checks separate from successful task completion.
No mocks or harness edits to an agent's output document.

Start with one or two tasks. Advance to five, then a frozen twenty only after
desktop setup, input, reset, cleanup and grading are trustworthy. Freeze and
record SDK/driver/native runtime versions, app versions, task definitions and
scoring policy across each comparison. Report both absolute success rates and
the native-success tasks OpenSky fails; both agents failing does not establish
parity. Report tool calls, elapsed time, infrastructure exclusions and spending
alongside successful outcomes. Repair observed gaps and rerun the same tasks.

Preserve native compaction with no whole-task deadline or tool-call budget.
Keep the existing independently enforced spending controls: cumulative limit
currently approved through $150 (explicit approval on 2026-09-10), with user
review before the next $50 increment.
Use `evals/runs/parity-budget.json` as the authoritative cumulative ledger;
conservative full-reservation charges are estimates, not invoices. Report each
completed run and keep the status canvas current. Exclude Codex's in-app browser.

## Active comparison

The first fixed-software 20-task baseline is complete: native 18/20 and
OpenSky 14/20. Its immutable plan and results are in
`evals/runs/linux-baseline-8c818c7`; original arms remain in
`evals/runs/campaign-linux-smoke-1`. Some pairs differ in Ubuntu point-release
labels. This is a single-run software baseline, not strict environment identity
throughout or a repeatability estimate.

The correction campaign is `campaign-linux-visibility-candidate`, using frozen
SDK/evaluator 825b58525a8b8e7e22cbcef60a9a39e2a574595b and exact driver
2ff75ef21a5173935fd4cbd1b69fa6094299211d. Its two-task smoke passed both arms;
its five-task ramp completed with OpenSky 3/5 and native 2/5. Both failed repeated
subscripts and the required frozen-header region; native additionally left
extra profit formulas. These failures stay in the metric.

`full20-selection.json` fixes the same original 20 task IDs, hashes of the first
five pairs, and every remaining arm name/order. The full comparison is complete: OpenSky16/20 and native14/20,
with13shared successes,3OpenSky-only successes,1native-only success and3shared
failures. The native-only task is presentation font sizing: OpenSky reached
the requested sizes but inserted two unwanted line breaks. Select only those declared arms; do not substitute a later successful
retry or mix software versions. The live scorecard derives completed matched
tasks, per-arm outcome metrics and the active receipt from retained artifacts.
Use those artifacts for current counts, not historical prose.

The owned finite serial queue delegates dispatch, spending reservation,
finalization and fingerprint comparison to the existing helpers. Valid task
failures continue; invalid/unmatched evidence, unresolved accounting, helper
errors or the approved spending cap stop further dispatch. Recover a stopped
reader against its existing authoritative CI run; never redispatch merely
because an observation timed out. Do not start a second queue while one is live.

After every completed arm, inspect the actual saved output or external app
outcome, confirm cleanup and final usage, and report progress. Preserve raw and
adapted Impress grades; diagnostics cannot repair or regrade agent files.
The declared set is finished; prioritize the remaining native-only font gap. Report both/neither/one-sided outcomes and infrastructure exclusions.
Both agents failing a task does not establish parity.

## Driver acceptance and remaining work

The separate screen-origin correction2e81b62123eda2807ff15edcf6834389dc938c45
is in draft driver PR#5. A maximized LibreOffice frame at0,0 was mistaken for
a renderer-local coordinate provider, adding17pixels to already-screen field
bounds. Read-only geometry and two public pixel controls isolate that offset.
Four unchanged font-field controls now save60pt with text preserved; a displaced
Code indexed Find/Replace test passes before and after. Both use exact binaries,
independent saved-file checks and verified app/temp/container cleanup. Calc
indexed/scrolled-cell regressions are the remaining supporting gate before
fresh paid smoke. A fix to indexed targeting does not establish that an agent
will choose the correct font-editing sequence. Unfocused setValue+Enter is not
claimed fixed. Preserve the complete20-task campaign while testing new source.


The visibility candidate is stacked on the indexed-object identity correction
in draft driver PR #4. Seven focused real SDK cases pass on its exact binary:
visible labelled dropdown editing, indexed/scrolled cells, wrong-window refusal,
help-title retention, stable retained indices and rejection of removed indices.
Saved outcomes and owned app/container cleanup are verified. This supports the
experimental agent comparison; it does not replace canonical certification.

Once the candidate is stable, run the complete supported Linux desktop harness
on its exact SHA. Keep Wayland/compositor evidence separate from X11. Before
readiness/merge, account for the repository's cross-platform certification
requirements and any unavailable platform gate. Keep the PR draft while those
requirements remain incomplete. No local macOS GUI work is part of this phase.

GitHub-hosted paired agents and disposable Docker SDK tests on the authorized
exe.dev machine are working. No persistent runner registration is needed.
Behavioral success takes precedence over speed tuning. Keep reporting wall
time, tool calls and context; investigate only substantial experience or
iteration problems without changing frozen task expectations.

See [harness-friction.md](harness-friction.md) for per-fix evidence and
[linux-parity-history.md](linux-parity-history.md) for retained earlier
milestones. Historical macOS results do not count as Linux evidence.
