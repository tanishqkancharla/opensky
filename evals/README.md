# evals

Compare computer-use harnesses on a **fresh Cua Fleet VM per case**. The agent and judge are both `openai/gpt-5.6-sol`. Scoring is a judge over the transcript: passed criteria / total criteria (including whether the path was efficient).

```bash
export FLEETS_TOKEN=...          # or CUA_CLIENT_ID + CUA_CLIENT_SECRET
export OPENAI_API_KEY=...
bun run evals -- --harness opensky,cua-driver
bun run evals -- terminal-echo.eval.ts --harness opensky
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

evalCase({ name: "terminal echoes OPENSKY-OK" }, async ({ harness }) => {
  const response = await harness.send(
    "Open the Foot terminal, run `echo OPENSKY-OK`, and leave the output visible.",
  );
  return response.score([
    "A Foot/terminal window artifact shows OPENSKY-OK.",
    "Used the computer-use harness, not osascript/cliclick.",
    "Efficient path: target Foot once, snapshot, type the command, Enter, re-snapshot.",
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

The default Fleet image is **Linux Omarchy** (Hyprland + Foot). Cases must use apps that exist there — Foot does; Calculator and Chromium do not on the current image.

The three-way compare including `codex` needs a **macOS** Fleet image with a terminal, `cua-driver`, and Codex CLI + Computer Use installed.
