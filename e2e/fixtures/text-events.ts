import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { assertDisposableLinuxDesktop } from "../../evals/parity/linux-app.js";

type Receipt = { kind?: string; type?: string; registered?: string[] };
const requiredEventTypes = ["object:text-changed", "object:text-selection-changed", "object:state-changed:focused"];

/** Run a passive AT-SPI observer around a real public-SDK action. */
export async function withTextEvents(directory: string, pid: number, use: () => Promise<void>): Promise<void> {
  assertDisposableLinuxDesktop();
  await mkdir(directory, { recursive: true });
  const child = spawn(process.env.OPENSKY_ATSPI_PYTHON ?? "/usr/bin/python3", [
    fileURLToPath(new URL("./text-events.py", import.meta.url)), String(pid),
  ], { stdio: ["pipe", "pipe", "pipe"], detached: true });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", value => stdout.push(value));
  child.stderr.on("data", value => stderr.push(value));
  child.stdin.on("error", () => { /* retained cleanup receipt records the outcome */ });
  const lines = createInterface({ input: child.stdout });
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
  let readySettled = false;
  const ready = new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => {
      if (!readySettled) { readySettled = true; clearTimeout(timer); reject(error); }
    };
    const timer = setTimeout(() => fail(new Error("AT-SPI text observer did not announce readiness")), 10_000);
    child.once("error", error => fail(error));
    child.once("close", () => fail(new Error("AT-SPI text observer exited before readiness")));
    lines.on("line", line => {
      try {
        const receipt = JSON.parse(line) as Receipt;
        if (receipt.kind === "ready" && !readySettled) {
          if (!Array.isArray(receipt.registered) || !requiredEventTypes.every(type => receipt.registered!.includes(type))) {
            fail(new Error("AT-SPI observer announced readiness without registered event types"));
          } else {
            readySettled = true;
            clearTimeout(timer);
            resolve();
          }
        }
      } catch (error) {
        fail(new Error(`Invalid AT-SPI observer output: ${error}`));
      }
    });
  });

  let originalError: unknown;
  let programSucceeded = false;
  try {
    await ready;
    await use();
    programSucceeded = true;
  } catch (error) {
    originalError = error;
  }

  let cleanupError: Error | undefined;
  let groupExited: boolean | undefined;
  const signals: string[] = [];
  const signal = (name: "SIGTERM" | "SIGKILL") => {
    if (!child.pid) return;
    try { process.kill(-child.pid, name); signals.push(name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") signals.push(String(error)); }
  };
  try {
    child.stdin.end();
    const term = setTimeout(() => signal("SIGTERM"), 2_000);
    const kill = setTimeout(() => signal("SIGKILL"), 4_000);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([closed, new Promise<void>(resolve => { deadline = setTimeout(resolve, 6_000); })]);
    clearTimeout(term); clearTimeout(kill); clearTimeout(deadline); lines.close();
    groupExited = !child.pid;
    if (child.pid) {
      try { process.kill(-child.pid, 0); }
      catch (error) { groupExited = (error as NodeJS.ErrnoException).code === "ESRCH"; }
    }
    const output = Buffer.concat(stdout).toString();
    await writeFile(join(directory, "text-events.jsonl"), output);
    await writeFile(join(directory, "text-events-stderr.log"), Buffer.concat(stderr));
    let events: Receipt[] = [];
    try { events = output.split("\n").filter(Boolean).map(line => JSON.parse(line) as Receipt); }
    catch (error) { throw new Error(`Invalid retained AT-SPI observer output: ${error}`); }
    if (!groupExited || child.exitCode !== 0 || !events.some(event => event.kind === "stopped")) {
      throw new Error("AT-SPI observer did not finish cleanly; inspect its retained trace and cleanup receipt");
    }
    if (events.some(event => event.kind === "callback-error")) {
      throw new Error("AT-SPI observer reported callback errors; inspect its retained trace and cleanup receipt");
    }
    if (programSucceeded && !events.some(event => event.kind === "event" && event.type?.startsWith("object:text-changed"))) {
      throw new Error("AT-SPI diagnostic has no text-change coverage for the completed real program");
    }
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error(String(error));
  } finally {
    await writeFile(join(directory, "text-events-cleanup.json"), JSON.stringify({
      pid: child.pid, groupExited,
      exitCode: child.exitCode, signalCode: child.signalCode, signals,
      cleanupError: cleanupError?.message,
    }, null, 2)).catch(error => {
      if (!cleanupError) cleanupError = error instanceof Error ? error : new Error(String(error));
    });
  }
  // The SDK action is primary evidence; cleanup diagnostics must not replace it.
  if (originalError) throw originalError;
  if (cleanupError) throw cleanupError;
}
