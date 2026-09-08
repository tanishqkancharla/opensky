import { spawn } from "node:child_process";
import { open, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const stage = Number(process.argv[2]);
const destination = process.argv[3] && resolve(process.argv[3]);
const previous = process.argv[4] && resolve(process.argv[4]);
const manifest = JSON.parse(await readFile(join(root, "osworld/manifest.json"), "utf8"));
if (![2, 5, 20].includes(stage) || !destination) throw new Error("Use campaign.ts 2|5|20 NEW_DIRECTORY [PREVIOUS_CAMPAIGN]");
const taskIds: string[] = stage === 2 ? manifest.smokeTaskIds : stage === 5 ? manifest.rampTaskIds : manifest.fullTaskIds;
if (!taskIds || taskIds.length !== stage || new Set(taskIds).size !== stage) throw new Error("The requested stage has no complete frozen task set");

type Arm = { taskId: string; backend: string; directory: string; exitCode: number; status: any; score: any; campaignError: string | null };
async function readJson(path: string) { return JSON.parse(await readFile(path, "utf8")); }
if (stage > 2) {
  if (!previous) throw new Error("Provide the completed preceding stage before ramping up");
  const prior = await readJson(join(previous, "summary.json"));
  const expectedStage = stage === 5 ? 2 : 5;
  if (prior.stage !== expectedStage || !prior.completed || prior.runs.length !== expectedStage * 2) throw new Error("Previous stage did not complete");
  const seen = new Set<string>();
  for (const arm of prior.runs as Arm[]) {
    const status = await readJson(join(previous, arm.directory, "run-status.json"));
    const score = await readJson(join(previous, arm.directory, "score.json"));
    if (arm.exitCode !== 0 || arm.campaignError || !status.validEvaluation || status.cleanup?.status !== "passed" || !status.temporaryRemoved || score.infrastructureError) throw new Error("Previous stage contains invalid infrastructure/cleanup");
    if (status.taskId !== arm.taskId || status.backend !== arm.backend || !["native", "opensky"].includes(arm.backend)) throw new Error("Previous stage identity mismatch");
    seen.add(`${arm.taskId}/${arm.backend}`);
  }
  if (seen.size !== expectedStage * 2) throw new Error("Previous stage does not contain distinct matched arms");
}
await mkdir(destination); // New campaigns never overwrite or restart old work.
await writeFile(join(destination, "plan.json"), JSON.stringify({ stage, taskIds, manifest, model: "gpt-5.6-terra", reasoning: "medium", timeoutMs: 240_000, maxReplCalls: 20, previous, startedAt: new Date().toISOString() }, null, 2));
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
  stopping = true;
  console.error("Stopping after the active bounded attempt and its cleanup; no next task will start.");
});
const runs: Arm[] = [];
let fingerprint: string | undefined;
let nativeFingerprint: string | undefined;
async function report(completed: boolean) {
  const pairs = taskIds.map(taskId => {
    const arms = runs.filter(run => run.taskId === taskId);
    const valid = arms.length === 2 && arms.every(arm => arm.exitCode === 0 && !arm.campaignError && arm.status?.validEvaluation === true);
    const native = arms.find(arm => arm.backend === "native");
    const opensky = arms.find(arm => arm.backend === "opensky");
    const a = native?.score?.outcome.taskSuccess === true, b = opensky?.score?.outcome.taskSuccess === true;
    return { taskId, valid, outcome: !valid ? "unscored" : a && b ? "both" : a ? "native-only" : b ? "opensky-only" : "neither" };
  });
  const validPairs = pairs.filter(pair => pair.valid);
  await writeFile(join(destination, "summary.json"), JSON.stringify({ stage, taskIds, completed, stopping, runs, pairs,
    validPairs: validPairs.length, unscoredPairs: stage - validPairs.length,
    nativeSuccesses: validPairs.filter(pair => ["both", "native-only"].includes(pair.outcome)).length,
    openskySuccesses: validPairs.filter(pair => ["both", "opensky-only"].includes(pair.outcome)).length,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}
await report(false);
for (const [index, taskId] of taskIds.entries()) {
  // Counterbalance interface order, while keeping desktop use sequential.
  for (const backend of index % 2 ? ["opensky", "native"] : ["native", "opensky"]) {
    if (stopping) break;
    const directory = `${String(index + 1).padStart(2, "0")}-${taskId}-${backend}`;
    const artifacts = join(destination, directory);
    await mkdir(artifacts);
    const log = await open(join(artifacts, "controller.log"), "wx", 0o600);
    console.log(JSON.stringify({ event: "started", taskId, backend, directory }));
    let exitCode: number;
    try {
      exitCode = await new Promise<number>((accept, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", join(root, "osworld/smoke.ts"), taskId, backend, artifacts], { cwd: resolve(root, "../.."), detached: true, stdio: ["ignore", log.fd, log.fd] });
        child.once("error", reject);
        child.once("exit", code => accept(code ?? 1));
      });
    } finally { await log.close(); }
    const status = await readJson(join(artifacts, "run-status.json")).catch(() => null);
    const score = await readJson(join(artifacts, "score.json")).catch(() => null);
    const environment = await readJson(join(artifacts, "environment.json")).catch(() => null);
    let campaignError: string | null = null;
    if (!environment) campaignError = "Missing environment fingerprint";
    else {
      const current = JSON.stringify([environment.codeAndAssetsSha256, environment.driver.sha256, environment.libreOffice, environment.vsCode, environment.node, environment.release, environment.osVersion, environment.codex, environment.python]);
      if (fingerprint && fingerprint !== current) campaignError = "Code/assets/desktop environment changed during campaign";
      fingerprint ??= current;
      if (backend === "native") {
        const currentNative = JSON.stringify(environment.nativeReference);
        if (!environment.nativeReference || (nativeFingerprint && nativeFingerprint !== currentNative)) campaignError = "Native backend changed or was not fingerprinted";
        nativeFingerprint ??= currentNative;
      }
    }
    runs.push({ taskId, backend, directory, exitCode, status, score, campaignError });
    if (exitCode !== 0 || campaignError || !status?.validEvaluation) stopping = true;
    await report(false);
    console.log(JSON.stringify({ event: "finished", taskId, backend, valid: !campaignError && (status?.validEvaluation ?? false), outcome: score?.outcome, campaignError, stopping }));
  }
  if (stopping) break;
}
await report(!stopping && runs.length === stage * 2);
process.exitCode = stopping ? 1 : 0;
