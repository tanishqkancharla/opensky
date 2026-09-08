import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
type Identity = { pid: number; bundleId: string; launchedAt: number };
type OwnedApp = Identity & { activate(): Promise<{ accepted: boolean }>; inspect(options?: { accessibility?: boolean }): Promise<Identity & { finishedLaunching: boolean; activationPolicy: number; focusedWindowAX?: string[]; windows: { title: string; windowId: number; onScreen: boolean }[] }> };
type AppFixtureOptions = { bundleId: string; appPath: string; artifacts: string; launchArguments?: string[]; launchEnvironment?: Record<string, string>; disposableProfile?: boolean };

/** Own an exact Launch Services process, independent of either evaluated SDK.
 * Refuse to start when that app is in use: the bundle-based native reference
 * must address this fixture and must not read or change the user's instance. */
export async function withOwnedMacApp<T>(options: AppFixtureOptions, use: (app: OwnedApp) => Promise<T>): Promise<T> {
  if (process.platform !== "darwin") throw new Error("This fixture requires macOS");
  await mkdir(options.artifacts, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "opensky-eval-lifecycle-"));
  try { return await withCompiledMacApp(options, temporary, use); }
  finally { await rm(temporary, { recursive: true, force: true }); }
}

async function withCompiledMacApp<T>(options: AppFixtureOptions, temporary: string, use: (app: OwnedApp) => Promise<T>): Promise<T> {
  const helper = join(temporary, "mac-app-lifecycle");
  await exec("/usr/bin/swiftc", ["-module-cache-path", join(temporary, "swift-cache"), fileURLToPath(new URL("./mac-app-lifecycle.swift", import.meta.url)), "-o", helper], { timeout: 60_000 });
  const checkDesktop = async (phase: "before" | "after") => {
    const state = JSON.parse((await exec(helper, ["desktop-state"], { timeout: 10_000 })).stdout) as { ready: boolean; reasons: string[] };
    await writeFile(join(options.artifacts, `desktop-${phase}.json`), JSON.stringify({ checkedAt: new Date().toISOString(), ...state }, null, 2));
    if (!state.ready) throw new Error(`Local GUI evaluation paused: ${state.reasons.join(", ")}. Make the desktop visible and unlocked before rerunning.`);
  };
  try { await checkDesktop("before"); }
  catch (error) {
    // No launch has been attempted, so callers may remove their fresh scratch
    // profile/document without waiting for a nonexistent ownership receipt.
    await writeFile(join(options.artifacts, "cleanup.json"), JSON.stringify({ status: "passed", launched: false, verifiedExited: true, reason: "desktop preflight prevented app launch" }, null, 2));
    throw error;
  }
  const list = async (): Promise<Identity[]> => JSON.parse((await exec(helper, ["list", options.bundleId], { timeout: 10_000 })).stdout);
  if ((await list()).length) throw new Error(`${options.bundleId} is already running; no app was launched or altered`);
  // Launch Services returns the exact new NSRunningApplication, not a PID
  // guessed from a process-list difference. The launch option is per-process.
  const owned = JSON.parse((await exec(helper, ["launch", options.appPath, options.bundleId, JSON.stringify(options.launchArguments ?? ["-ApplePersistenceIgnoreState", "YES"]), JSON.stringify(options.launchEnvironment ?? {})], { timeout: 30_000 })).stdout) as Identity;
  let result: T | undefined;
  let actionError: unknown;
  try {
    await writeFile(join(options.artifacts, "app-ownership.json"), JSON.stringify({ ...owned, appPath: options.appPath, restoreState: false }, null, 2));
    result = await use({ ...owned,
      activate: async () => JSON.parse((await exec(helper, ["activate", String(owned.pid), owned.bundleId, String(owned.launchedAt)], { timeout: 10_000 })).stdout),
      inspect: async (inspectOptions) => JSON.parse((await exec(helper, [inspectOptions?.accessibility ? "inspect-ax" : "inspect", String(owned.pid)], { timeout: 10_000 })).stdout),
    });
  } catch (error) { actionError = error; }
  try {
    const running = await list();
    const stillRunning = running.some(app => app.pid === owned.pid && app.launchedAt === owned.launchedAt);
    await writeFile(join(options.artifacts, "app-before-cleanup.json"), JSON.stringify({ pid: owned.pid, stillRunning, checkedAt: new Date().toISOString() }, null, 2));
    if (!stillRunning) throw new Error("Owned app exited during the task, before fixture cleanup; evaluation is invalid");
  } catch (error) { actionError = actionError ? new AggregateError([actionError, error], "Evaluation failed and app liveness could not be verified") : error; }
  try { await checkDesktop("after"); }
  catch (error) { actionError = actionError ? new AggregateError([actionError, error], "Evaluation failed and desktop became unavailable") : error; }
  let cleanupError: unknown;
  try {
    let cooperative = true;
    const running = await list();
    const current = running.find(app => app.pid === owned.pid);
    if (current) {
      try { await exec(helper, ["quit", String(owned.pid), owned.bundleId, String(owned.launchedAt)], { timeout: 10_000 }); }
      catch (error) {
        if (!options.disposableProfile) throw error;
        // Only fresh, explicitly disposable profiles may take this path. The
        // saved-file score is already captured; unsaved task edits never gain
        // credit through teardown. Recheck PID/bundle/launch time at dispatch.
        await exec(helper, ["stop-disposable", String(owned.pid), owned.bundleId, String(owned.launchedAt)], { timeout: 10_000 });
        cooperative = false;
      }
    }
    const after = await list();
    if (after.some(app => app.pid === owned.pid)) throw new Error("Owned app remained running after quit");
    if (after.length) throw new Error("An unexpected app instance appeared during the fixture; preserve scratch files for recovery");
    await writeFile(join(options.artifacts, "cleanup.json"), JSON.stringify({ status: "passed", pid: owned.pid, verifiedExited: true, cooperative, fallback: cooperative ? null : "SIGTERM to verified disposable profile process" }, null, 2));
  } catch (error) {
    cleanupError = error;
    await writeFile(join(options.artifacts, "cleanup.json"), JSON.stringify({ status: "failed", pid: owned.pid, error: String(error) }, null, 2));
  }
  if (actionError && cleanupError) throw new AggregateError([actionError, cleanupError], "Evaluation and cleanup failed");
  if (cleanupError) throw cleanupError;
  if (actionError) throw actionError;
  return result as T;
}
