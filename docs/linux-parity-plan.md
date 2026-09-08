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
Use `evals/runs/parity-budget.json` as the authoritative cumulative ledger;
conservative full-reservation charges are estimates, not invoices. Report each
completed run and keep the status canvas current. Exclude Codex's in-app browser.

## Current evidence and next gate

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
- `five-task-baseline-summary.json` preserves the selected run history before
  fixes. Cumulative accounting is $72.1508874, with no active reservation.
  Paid retries are paused while real input regressions are verified.
- The public Alt shortcut defect has real acceptance evidence on driver
  183cc3f1c. Unicode delivery remains intermittent; delivery-barrier candidate
  0524101f8 failed three fresh desktops. A client-map refresh delay candidate
  e04e1e08e is under test. The SDK fresh-token correction has reproduced
  stale-save-button evidence and is under three-desktop verification. Do not
  promote these pending checks into improved agent scores.
- Full twenty-task support remains unfinished: install and validate Linux Calc
  and Impress, implement the real VS Code task fixture, verify reset/cleanup
  and scoring for each category, then freeze that environment for paired runs.
  The current worker rejects VS Code explicitly; do not silently omit those tasks.
- User-provided exe.dev host is reachable with the correct account. Official
  runner files and dependencies are installed. Persistent runner registration
  and service startup await explicit approval after automatic review rejected
  that expansion of future job access. Hosted evaluations continue meanwhile.
- Preserve macOS driver follow-ups for later; historical macOS results do not
  count as Linux evidence.
