import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDisposableLinuxDesktop } from "../../evals/parity/linux-app.js";

/** Observe the owned X11 display only; readiness precedes the original program. */
export async function withX11InputRecord(directory: string, use: () => Promise<void>): Promise<void> {
  assertDisposableLinuxDesktop();
  await mkdir(directory, { recursive: true });
  const child = spawn(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [fileURLToPath(new URL("./x11-input-record.py", import.meta.url))], {
    stdio: ["pipe", "pipe", "pipe"], detached: true,
  });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  child.stdout.on("data", value => stdout.push(value));
  child.stderr.on("data", value => stderr.push(value));
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("X11 observer did not announce readiness")), 10_000);
    const fail = (error: Error) => { clearTimeout(timer); reject(error); };
    child.once("error", fail);
    child.once("close", () => fail(new Error("X11 observer exited before readiness")));
    lines.on("line", line => {
      try { if (JSON.parse(line).kind === "ready") { clearTimeout(timer); resolve(); } }
      catch (error) { fail(new Error(`Invalid X11 observer output: ${error}`)); }
    });
  });
  child.stdin.on("error", () => { /* exit and cleanup receipt expose failure */ });
  try {
    await ready;
    await use();
  } finally {
    child.stdin.end();
    const signals: string[] = [];
    const signal = (name: "SIGTERM" | "SIGKILL") => {
      if (!child.pid) return;
      try { process.kill(-child.pid, name); signals.push(name); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") signals.push(String(error)); }
    };
    const term = setTimeout(() => signal("SIGTERM"), 2_000);
    const kill = setTimeout(() => signal("SIGKILL"), 4_000);
    await closed;
    clearTimeout(term); clearTimeout(kill); lines.close();
    let groupExited = !child.pid;
    if (child.pid) {
      try { process.kill(-child.pid, 0); }
      catch (error) { groupExited = (error as NodeJS.ErrnoException).code === "ESRCH"; }
    }
    const output = Buffer.concat(stdout).toString();
    await writeFile(join(directory, "x11-input.jsonl"), output);
    await writeFile(join(directory, "x11-input-stderr.log"), Buffer.concat(stderr));
    await writeFile(join(directory, "x11-input-cleanup.json"), JSON.stringify({ pid: child.pid, groupExited,
      exitCode: child.exitCode, signalCode: child.signalCode, signals }, null, 2));
    if (!groupExited || child.exitCode !== 0 || !output.split("\n").some(line => line && JSON.parse(line).kind === "stopped")) {
      throw new Error("X11 observer did not finish cleanly; inspect its retained trace and cleanup receipt");
    }
  }
}
