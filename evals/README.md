# evals

Compare computer-use harnesses on a **fresh Cua Fleet VM per case**. The agent and judge default to `openai/gpt-5.6-terra`. Scoring is a judge over the transcript: passed criteria / total criteria (including whether the path was efficient).

Development tests and evaluations run on Node 22.19 or newer (Node 24 in CI),
with `tsx` loading TypeScript source. Run `npm ci` before using the commands
below. The strict evaluator requires VM microtask draining under its timeout;
Bun 1.3.4 does not provide that behavior and is unsupported for strict
evaluations. Ordinary, non-strict CLI compatibility with Bun does not imply
strict evaluation support.

```bash
export FLEETS_TOKEN=...          # or CUA_CLIENT_ID + CUA_CLIENT_SECRET
export OPENAI_API_KEY=...
npm run evals -- --harness opensky,cua-driver
npm run evals -- terminal-echo.eval.ts --harness opensky
```

`--harness` values:

| id | Agent | Tools |
| --- | --- | --- |
| `opensky` | Pi | opensky methods only |
| `cua-driver` | Pi | `cua_driver_call` (raw `cua-driver call`) |
| `codex` | `codex exec --model gpt-5.6-terra` on the VM | Codex Computer Use / `@oai/sky` |

Pi built-in coding tools are off for the first two arms.

For OpenSky cases, retain every `open_target` handle and call `close_target`
with that handle during evaluator cleanup. Browser profiles are isolated and
native macOS cleanup is admitted only for a fresh request-created process with
one exact window; structured confirmation/refusal outcomes must be reported and
retried after resolution, never replaced with a hotkey, menu, coordinate, or
process-kill fallback. This makes cleanup behavior part of the harness evidence
without granting authority over pre-existing user windows.

## Writing a case

### Controlled-page context integration

`probe-browser-context.ts` exercises the real signed local helper against
declarative article/list/table pages served on an ephemeral loopback port. It
checks sibling qualifiers, outward group traversal, unchanged snapshot identity,
one-call context reads, retained old action refs, and read-only input refusal.
These controlled checks supplement, not replace, fresh model evaluations on
ordinary websites. They produce a public operation timeline and raw driver tape;
no mock or model is used. Only exact probe-owned tabs/sessions are closed. A
quiescent helper and explicit source revision are required before opening a tab.

```bash
OPENSKY_REAL_DRIVER=1 \
OPENSKY_DRIVER_BINARY=/absolute/path/to/opensky-driver \
EVAL_EXPECTED_DRIVER_SHA="REPLACE_WITH_EXACT_CONTEXT_CAPABLE_COMMIT_SHA" \
node --import tsx evals/probe-browser-context.ts
```

This opt-in probe needs a provisioned GUI runner and is not part of the ordinary
unit suite. It does not install/start the helper or change permissions. Reports
are kept in a unique temporary directory printed at completion; the private
runtime directory is removed only after exact inactive receipts, clean transport
exit, and an unambiguous empty operator inventory. Unproven cleanup retains it.

### Model task

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
| `CUA_EVAL_IMAGE` | Image ref. Default is Linux Omarchy; macOS defaults to `ghcr.io/trycua/macos-tahoe-cua:latest` |
| `CUA_EVAL_OS` | `linux` (default), `macos`, or `windows` |
| `CUA_EVAL_CPU` | vCPU count (default 4) |
| `CUA_EVAL_MEMORY_MB` | Memory in MiB (default 6144 linux / 8192 macos) |
| `EVAL_DELETE_POOL=1` | Delete the pool when the case VM exits |
| `OPENAI_API_KEY` | Pi / judge |

The default Fleet image is **Linux Omarchy** (Hyprland + Foot). Cases must use apps that exist there — Foot does; Calculator and Chromium do not on the current image.

Cua Fleet cloud currently boots Linux (Omarchy). `Image.macos()` is local Lume. A 2026-08-31 KubeVirt claim of `ghcr.io/trycua/macos-tahoe-cua:latest` stayed at `ready_replicas=0` and `ClaimTimeout`. Patching the template to `RuntimeKind.MACOS` was rejected with HTTP 403 `k8s request is not allowed` on this account. Re-run when you have a macOS containerDisk digest and macOS-runtime access:

```bash
export CUA_EVAL_OS=macos
export CUA_EVAL_IMAGE='…macos containerDisk digest…'
export CUA_POOL_NAME=opensky-macos-evals
node --import tsx evals/macos-compat.ts
```
