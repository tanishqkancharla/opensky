import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const exec = promisify(execFile);
type Identity = { group: number; pid: number; window: string; startTicks: string };
async function processIdentity(pid: number) {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8");
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  return { group: Number(fields[2]), startTicks: fields[19], state: fields[0] };
}

/** Own one fresh app process group inside a disposable remote desktop.
 * Setup only activates the requested document; task input belongs to the agent. */
export async function withOwnedLinuxApp<T>(options: {
  executable: string; args: string[]; documentTitle: string; artifacts: string;
  env?: NodeJS.ProcessEnv;
}, use: (owned: Identity & { inspect(): Promise<boolean> }) => Promise<T>): Promise<T> {
  if (process.platform !== "linux" || process.env.GITHUB_ACTIONS !== "true") throw new Error("Disposable Linux CI desktop required; no app was launched");
  const child = spawn(options.executable, options.args, { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...options.env } });
  let log = "";
  let launchError: Error | undefined;
  child.on("error", error => { launchError = error; });
  child.stdout.on("data", data => { log += data; });
  child.stderr.on("data", data => { log += data; });
  const group = child.pid;
  const alive = () => { if (!group) return false; try { process.kill(-group, 0); return true; } catch { return false; } };
  let result: T | undefined;
  let actionError: unknown;
  let owned: Identity | undefined;
  try {
    if (!group) throw new Error("App launch produced no owned process");
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && !owned) {
      if (launchError) throw launchError;
      const found = await exec("xdotool", ["search", "--onlyvisible", "--name", options.documentTitle], { timeout: 3_000 }).catch(() => null);
      for (const window of found?.stdout.trim().split("\n").filter(Boolean) ?? []) {
        const pid = Number((await exec("xdotool", ["getwindowpid", window], { timeout: 3_000 })).stdout.trim());
        const identity = await processIdentity(pid).catch(() => null);
        if (identity?.group === group && !["Z", "X"].includes(identity.state)) owned = { group, pid, window, startTicks: identity.startTicks };
      }
      if (!owned) await delay(250);
    }
    if (!owned) throw new Error("Owned document window did not become visible");
    const identity = owned;
    const inspect = async () => {
      const current = await processIdentity(identity.pid).catch(() => null);
      return current?.group === identity.group && current.startTicks === identity.startTicks && !["Z", "X"].includes(current.state);
    };
    await exec("xdotool", ["windowactivate", "--sync", identity.window], { timeout: 5_000 });
    await writeFile(join(options.artifacts, "app-ownership.json"), JSON.stringify(identity, null, 2));
    result = await use({ ...identity, inspect });
    if (!await inspect()) throw new Error("Owned app exited during evaluation, before cleanup");
  } catch (error) { actionError = error; }
  let cleanupError: unknown;
  try {
    if (alive()) process.kill(-group!, "SIGTERM");
    for (let i = 0; i < 40 && alive(); i++) await delay(100);
    if (alive()) process.kill(-group!, "SIGKILL");
    for (let i = 0; i < 20 && alive(); i++) await delay(100);
    if (alive()) throw new Error("Owned Linux process group remained alive after cleanup");
  } catch (error) { cleanupError = error; }
  await writeFile(join(options.artifacts, "app.log"), log);
  await writeFile(join(options.artifacts, "cleanup.json"), JSON.stringify({
    status: cleanupError ? "failed" : "passed", group, pid: owned?.pid, verifiedExited: !alive(),
    error: cleanupError ? String(cleanupError) : null,
  }, null, 2));
  if (actionError && cleanupError) throw new AggregateError([actionError, cleanupError], "Task and cleanup failed");
  if (cleanupError) throw cleanupError;
  if (actionError) throw actionError;
  return result as T;
}
