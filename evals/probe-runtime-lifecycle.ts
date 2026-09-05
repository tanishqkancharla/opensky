/** Real transport, delayed real response: no mock driver and no GUI actions. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CuaDriverClient } from "../src/driver.js";
import { detectTarget } from "../src/platform.js";
import type { DriverClient } from "../src/types.js";
import { createCuaReplToolRuntime } from "./cua-repl-tool.js";
import { RecordingDriverClient } from "./driver-tape.js";

const output = process.argv[2] ? resolve(process.argv[2]) : await mkdtemp(join(tmpdir(), "opensky-lifecycle-probe-"));
await mkdir(output, { recursive: true });
const real = new CuaDriverClient({ autoInstall: false, autoStart: false, timeoutMs: 4_000 });
const status = await real.status();
if (!status.running) throw new Error(`Real driver unavailable: ${status.text}`);
const tape = new RecordingDriverClient(real, { probe: "runtime-close-admission", realDriver: true });
let release!: () => void;
let responseArrived!: () => void;
const heldResponse = new Promise<void>((resolve) => { release = resolve; });
const responseReady = new Promise<void>((resolve) => { responseArrived = resolve; });
let held = false;
const attempted: string[] = [];
const driver: DriverClient = {
  status: () => real.status(),
  ensureDaemon: () => real.ensureDaemon(),
  async call(tool, args = {}) {
    attempted.push(tool);
    // Defense in depth: even a regression cannot open a window during this probe.
    assert.ok(["list_apps", "end_session"].includes(tool), `Unexpected non-observation driver request: ${tool}`);
    const result = await tape.call(tool, args);
    if (tool === "list_apps" && !held) {
      held = true;
      responseArrived();
      await heldResponse; // Preserve the real response; only its delivery is delayed.
    }
    return result;
  },
};
const runtime = createCuaReplToolRuntime(driver, detectTarget(), { homeDir: join(output, "runtime") });
const tool = runtime.tools[0]!;
const execute = (id: string, code: string) => tool.execute(id, { code }, undefined, undefined, {} as never);
const checks: unknown[] = [];
let error: unknown;
let first: ReturnType<typeof execute> | undefined;
let queued: ReturnType<typeof execute> | undefined;
try {
  first = execute("mid-cell", "await cua.listApps(); await cua.listApps();");
  await bounded(responseReady, "first real response");
  queued = execute("queued-cell", "await cua.listApps();");
  let closeSettled = false;
  const closing = runtime.close().then(() => { closeSettled = true; });
  await assert.rejects(async () => execute("late-cell", "await cua.createBrowserTab('chrome', 'https://example.com/')"), /closing.*not admitted/);
  await Promise.resolve();
  assert.equal(closeSettled, false, "close must wait for the admitted real response");
  assert.deepEqual(attempted, ["list_apps"]);
  release();
  const [firstResult, queuedResult] = await bounded(Promise.all([first, queued]), "admitted cells");
  assert.equal(firstResult.isError, true, "mid-cell dispatch must be refused after close starts");
  assert.equal(queuedResult.isError, true, "queued cell must not dispatch after close starts");
  assert.match(JSON.stringify(firstResult.content), /closing.*not admitted/);
  assert.match(JSON.stringify(queuedResult.content), /closing.*not admitted/);
  await bounded(closing, "runtime close and drain");
  assert.deepEqual(attempted, ["list_apps", "end_session"]);
  const ended = tape.tape.calls.find((call) => call.tool === "end_session")!;
  const receipt = ended.result?.structured as { session?: string; active?: boolean } | undefined;
  assert.equal(receipt?.session, ended.args.session);
  assert.equal(receipt?.active, false, "exact real session must be inactive");
  await runtime.close();
  await assert.rejects(async () => execute("closed-cell", "await cua.listApps()"), /closed.*not admitted/);
  assert.deepEqual(attempted, ["list_apps", "end_session"], "post-close calls cannot reach the driver");
  checks.push({ firstResult, queuedResult, closeWaitedForRealResponse: true, postCloseDispatches: 0, exactInactiveReceipt: receipt });
} catch (caught) {
  error = caught;
} finally {
  release();
  try {
    await bounded(Promise.allSettled([first, queued]), "pending cells during finalization");
    await bounded(runtime.close(), "final exact cleanup");
  } catch (caught) { error ??= caught; }
  await writeFile(join(output, "evidence.json"), `${JSON.stringify({
    passed: !error, realDriver: true, opensGuiTargets: false,
    responseDelayInjection: true, status, checks, attempted,
    error: error instanceof Error ? error.message : error,
    tape: tape.tape,
  }, null, 2)}\n`, { flag: "wx" });
}
if (error) throw error;
console.log(`Real-driver lifecycle checks passed: ${join(output, "evidence.json")}`);

async function bounded<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after 8 seconds`)), 8_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
