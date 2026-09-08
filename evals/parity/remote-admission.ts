import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EvaluationBudget } from "./budget.js";

const exec = promisify(execFile);
const envelope = JSON.parse(process.env.OPENSKY_RESERVATION_ENVELOPE!);
const reservationId = process.env.OPENSKY_REMOTE_RESERVATION;
const runId = Number(process.env.GITHUB_RUN_ID);
if (process.env.GITHUB_ACTIONS !== "true" || process.platform !== "linux" || process.env.GITHUB_RUN_ATTEMPT !== "1") throw new Error("Remote evaluation reservations may run only once, on disposable Linux CI");
if (process.env.GITHUB_REPOSITORY !== "tanishqkancharla/opensky" || !Number.isSafeInteger(runId) || runId <= 0 || !/^[a-f0-9-]{36}$/.test(reservationId ?? "")) throw new Error("Invalid remote evaluation identity");
if (envelope.version !== 1 || envelope.sourceSha !== process.env.GITHUB_SHA || envelope.reservationId !== reservationId || !["native", "opensky"].includes(envelope.backend) || envelope.model !== "gpt-5.6-terra" || !/^[a-f0-9-]{36}$/.test(envelope.taskId ?? "")) throw new Error("Reservation scope does not match this revision and worker");
const entry = envelope.ledger?.entries?.find((entry: { id: string }) => entry.id === reservationId);
if (entry?.status !== "reserved" || entry.reservationUsd !== 5 || entry.claimedBy || envelope.ledger.entries.filter((entry: { status: string }) => entry.status === "reserved").length !== 1) throw new Error("No unique unclaimed controller reservation");
// Workflow concurrency serializes a reservation. Only its first dispatch may
// consume it; a rerun or a second workflow dispatch cannot replay the envelope.
const pages = JSON.parse((await exec("gh", ["api", "--paginate", "--slurp",
  "repos/tanishqkancharla/opensky/actions/workflows/linux-agent.yml/runs?per_page=100",
], { timeout: 30_000, maxBuffer: 20_000_000 })).stdout);
const matches = pages.flatMap((page: any) => page.workflow_runs).filter((run: any) => run.display_title === `Linux agent / ${reservationId}`);
if (!matches.some((run: any) => run.id === runId) || Math.min(...matches.map((run: any) => run.id)) !== runId) throw new Error("Reservation has already been dispatched or this worker is not visible in GitHub");
const path = process.env.OPENSKY_REMOTE_BUDGET!;
await mkdir(dirname(path), { recursive: true });
await writeFile(path, JSON.stringify(envelope.ledger, null, 2), { flag: "wx", mode: 0o600 });
const snapshot = await new EvaluationBudget(path).snapshot();
if (snapshot.haltedReason || snapshot.availableUsd <= 0) throw new Error("Cumulative spending checkpoint does not permit this worker");
const artifacts = process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!;
await mkdir(artifacts, { recursive: true });
await writeFile(join(artifacts, "remote-admission.json"), JSON.stringify({
  admitted: true, runId, reservationId, sourceSha: envelope.sourceSha, taskId: envelope.taskId,
  backend: envelope.backend, model: envelope.model, reservedUsd: entry.reservationUsd,
  chargedBeforeRun: snapshot.chargedEstimateUsd, approvedThroughUsd: snapshot.approvedThroughUsd,
}, null, 2));
// Workflow inputs are data, never shell interpolation or executable snippets.
await writeFile(join(dirname(path), "task.json"), JSON.stringify({ taskId: envelope.taskId, backend: envelope.backend }));
await appendFile(process.env.GITHUB_ENV!, `OPENSKY_AGENT_TASK=${envelope.taskId}\nOPENSKY_AGENT_BACKEND=${envelope.backend}\n`);
