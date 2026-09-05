# Browser evaluation in CI

## Current hosted result

[First GitHub-hosted macOS run](https://github.com/tanishqkancharla/opensky/actions/runs/33947371636)
passed clean dependency installation, build, case registration, and runner/report
checks. The real-driver probe failed with `permissions_pending`: macOS
Accessibility or Screen Recording was not granted. No agent cases ran and no
acceptance score was earned. The cleanup attempt also hit the permission gate;
the disposable hosted worker is torn down by GitHub after the job.

The workflow records JSON and Markdown summaries and uploads run artifacts for
30 days. It runs validation on pushes/PRs, and real-driver probes/evals on manual
dispatch and daily schedules. GitHub schedules require the workflow on the
default branch. `OPENAI_API_KEY` is required only by the agent step. Set
`CUA_DRIVER_RS_VERSION` as a repository variable to pin the driver under test.
The current branch does not enable scheduled runs until merged.

Run the declarative cases on an already provisioned machine with:

```sh
bun evals/cli.ts browser.eval.ts --local --harness opensky --model openai/gpt-5.6-terra --output evals/runs/manual
```

Local mode does not install or launch the helper. Optional `CUA_DRIVER_BINARY`
and `CUA_DRIVER_SOCKET` select an explicit helper. `--list` lists cases without
launching the model or desktop. Local native Codex comparison is intentionally
unavailable until its plugin is explicitly provisioned; OpenSky scores are not
native parity scores.

To verify browser argument validation against the real helper without opening
GUI targets, run `bun evals/probe-browser-arguments.ts <new-output-directory>`.
It requires an already-running helper and installed Chrome, never installs or
starts the driver, and records exact results plus a driver tape in
`evidence.json`. Invalid calls must fail before driver dispatch. This is a
boundary regression check, not an agent-task completion or native parity score.

`browser.eval.ts` describes live tasks using `evalCase`, `harness.send`, and
`response.score`. Cases cover search and linked follow-up, release discovery,
shopping search refinement, and documentation lookup. They specify the user's
outcome, not selectors, element indices, a prescribed call sequence, or fixed
answers from a previous run. Each case uses one agent session; the Wikipedia
follow-up is a second step within that session.

## Hosted feasibility comes first

Do not equate a successful build or VM allocation with a usable desktop. Before
enabling acceptance runs on a hosted worker, retain evidence that it has:

- A real interactive desktop and installed browser supported by the actual
  driver, with the required accessibility and capture permissions.
- A working real-driver connection with the expected source revision, and a
  successful browser observation, interaction, and exact owned-target cleanup.
- Access to the selected agent model and, for a comparison, the actual native
  Codex computer-use implementation on a supported worker.
- Network access to the case websites and durable artifact storage.

Missing capabilities mean **infrastructure blocked**, not a passing case or a
product regression. Record the failed probe and stop dependent runs. Do not use
a mock driver or replayed responses as acceptance evidence. Do not substitute
local Lume for a hosted worker. A real Linux driver run may establish Linux
behavior, but cannot establish macOS AX parity or substitute for an unavailable
native comparison arm. See `README.md` for the existing Fleet feasibility
limitations; revalidate them on the worker actually selected.

## Comparison and scoring

Run the native Codex and Pi/OpenSky arms serially with the same model
(`gpt-5.6-terra`), task prompt, and comparable initial browser state. Complete and
verify cleanup before the next arm. Record any differences in OS, browser,
provider, reasoning settings, or model identity rather than silently treating
them as equivalent. User focus changes are environmental interference; keep
their evidence separate from harness failures.

Judge criteria are grouped by their text labels, so a single percentage is not
the acceptance decision:

| Dimension | Required evidence |
| --- | --- |
| Correctness and grounding | Live observations support each requested fact and navigation outcome. Honest blockage is preferable to invention but does not complete the task. |
| Friction | Calls, arguments, results, failures, recoveries, elapsed time, and token usage show the work needed to reach the outcome. |
| Cleanup | Exact task-owned targets were closed and a subsequent inventory or equivalent authoritative result establishes their absence; sibling targets remain. |
| Tool policy | The agent used the assigned computer-use implementation throughout. |

Compare efficiency only when both arms pass correctness, grounding, tool policy,
and cleanup. Preserve raw provider token categories, including cached input, and
report model tool calls separately from underlying driver calls. Do not compare
unlike token totals as if they had identical accounting. A lower call count from
an incomplete task is not an improvement.

## Evidence and cleanup

Retain the full prompt, model and runtime configuration, repository revisions,
raw timestamped agent/tool events with arguments and results, screenshots when
emitted, driver evidence, judge reasons, and a human-readable transcript. Keep
binary image data as referenced artifacts rather than expanding bytes into text.
Never publish credentials or key material in artifacts.

The prompt asks the agent to close exact owned targets, but prompt compliance and
judge opinion alone cannot prove cleanup. The runner must retain independent
cleanup evidence and report failures even if the answer is correct. On failure,
retry only cleanup authorized by recorded task ownership. Never close arbitrary
user tabs or kill a browser process to make an inventory look clean. Leave a run
with unresolved cleanup visibly failed and stop the next arm from inheriting it.

Website challenges, rate limits, and changing content should be recorded as
observed. Keep incomplete cases in the report; do not silently replace them with
easier tasks. Review improvements across these task families and additional
held-out tasks before making broad ergonomics or parity claims.
