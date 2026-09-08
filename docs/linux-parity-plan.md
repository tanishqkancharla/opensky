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
currently approved through $100, with user review before every further $50.
Current settled conservative accounting is $48.0770916. Initial Linux CI checks
do not dispatch models. Report each completed run and keep the status canvas
current. Exclude Codex's in-app browser.

## Current evidence and next gate

- GitHub run 34269423873 passed both Linux SDK smoke cases: Unicode observation
  and observing the result after a real page click.
- That run captured a real 1280×900 desktop image through the official package's
  native Linux `@oai/sky` 0.6.26 runtime. Input and complete task parity are not
  yet established by this capture.
- Native input passed the deterministic heading/save check twice. OpenSky
  initially failed to discover LibreOffice; driver c2705becf fixes the observed
  launcher/process mismatch and passed the same saved-file task in run
  34272626520. That run's native arm exposed a UI-readiness race, so both arms
  must rerun with screenshot-based readiness assertions before advancing.
- Linux daemon identity, accessibility/display preflight and environment hashes
  passed on both arms. The next remote run also verifies the actual native
  Node REPL screenshot transport without dispatching a model.
- Matched Linux agent campaigns remain pending. Linux grading and runtime
  fingerprints must be admitted independently of the historical macOS results.
- Preserve the macOS save-dialog failure and other driver follow-ups for later;
  do not relabel historical campaigns as Linux evidence.
