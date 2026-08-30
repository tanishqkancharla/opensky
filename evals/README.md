# evals

Compare computer-use harnesses on a **fresh Cua Fleet VM per case**. The agent and judge are both `openai/gpt-5.6-sol`. Scoring is a judge over the transcript: passed criteria / total criteria (including whether the path was efficient).

```bash
export FLEETS_TOKEN=...          # or CUA_CLIENT_ID + CUA_CLIENT_SECRET
export OPENAI_API_KEY=...
bun run evals -- --harness opensky,cua-driver
bun run evals -- calculator-6x7.eval.ts --harness opensky
```

`--harness` values:

| id | Agent | Tools |
| --- | --- | --- |
| `opensky` | Pi | opensky methods only |
| `cua-driver` | Pi | `cua_driver_call` (raw `cua-driver call`) |
| `codex` | `codex exec --model gpt-5.6-sol` on the VM | Codex Computer Use / `@oai/sky` |

Pi built-in coding tools are off for the first two arms.

## Writing a case

```ts
import { evalCase } from "./eval-case.js";

evalCase({ name: "calculator computes 6 × 7" }, async ({ harness }) => {
  const response = await harness.send("Open Calculator, compute 6 × 7, and leave the result visible.");
  return response.score([
    "Calculator's display shows 42.",
    "Used the computer-use harness, not osascript/cliclick.",
    "Efficient path: target Calculator once, snapshot, 6 × 7 =, re-snapshot.",
  ]);
});
```

Return the score. The runner writes `evals/runs/<id>/summary.json` and `cases/<id>/transcript.jsonl`.

## Environment

| Variable | Purpose |
| --- | --- |
| `FLEETS_TOKEN` or `CUA_CLIENT_ID` + `CUA_CLIENT_SECRET` | Cua Fleet |
| `CUA_POOL_NAME` | Pool name (default `opensky-evals`) |
| `CUA_EVAL_IMAGE` | Image ref. Default is Linux Omarchy |
| `CUA_EVAL_OS` | `linux` (default), `macos`, or `windows` |
| `EVAL_DELETE_POOL=1` | Delete the pool when the case VM exits |
| `OPENAI_API_KEY` | Pi / judge |

The three-way compare including `codex` needs a **macOS** Fleet image with Calculator, `cua-driver`, and Codex CLI + Computer Use installed.
