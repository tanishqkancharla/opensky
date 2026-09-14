import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type Trace = { kind?: string; actualDurationNs?: number; error?: string; startTime?: number; actualStopped?: boolean; resumed?: boolean; resumedObserved?: boolean };
const python = () => process.env.OPENSKY_EVAL_PYTHON ?? "python3";
const program = () => fileURLToPath(new URL("./app-stall.py", import.meta.url));

async function emergencyResume(pid: number, startTime: number) {
  const child = spawn(python(), [program(), "--resume-if-same", String(pid), String(startTime)], { stdio: ["ignore", "pipe", "pipe"] });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  child.stdout.on("data", value => stdout.push(value)); child.stderr.on("data", value => stderr.push(value));
  let timedOut = false;
  let spawnError: string | undefined;
  child.on("error", error => { spawnError = error.message; });
  const closed = new Promise<void>(resolve => child.once("close", resolve));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([closed, new Promise<void>(resolve => { timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); resolve(); }, 5_000); })]);
  clearTimeout(timeout);
  const output = Buffer.concat(stdout).toString();
  let trace: Trace | undefined;
  try { trace = output.split("\n").filter(Boolean).map(line => JSON.parse(line) as Trace).find(event => event.kind === "emergency-resume"); } catch { /* receipt retains malformed output */ }
  return { trace, exitCode: child.exitCode, timedOut, spawnError, stdout: output, stderr: Buffer.concat(stderr).toString() };
}

/**
 * Observes real X11 traffic and stops only this exact disposable Writer PID
 * after the temporary U+00E9 mapping and its matching KeyPress. The public SDK
 * action remains primary evidence; diagnostics are retained separately.
 */
export async function withAppStall(directory: string, writerPid: number, use: () => Promise<void>): Promise<void> {
  if (!Number.isSafeInteger(writerPid) || writerPid <= 0) throw new Error("Writer PID must be a positive integer");
  if (process.env.OPENSKY_DISPOSABLE_DESKTOP !== "1") throw new Error("App-stall control requires a disposable Linux desktop");
  await mkdir(directory, { recursive: true });
  const child = spawn(python(), [program(), String(writerPid)], { stdio: ["pipe", "pipe", "pipe"], detached: true });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  child.stdout.on("data", value => stdout.push(value)); child.stderr.on("data", value => stderr.push(value));
  child.stdin.on("error", () => { /* cleanup receipt records the closed observer pipe */ });
  const lines = createInterface({ input: child.stdout });
  const closed = new Promise<void>(resolve => child.once("close", resolve));
  let readySettled = false;
  const ready = new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => { if (!readySettled) { readySettled = true; clearTimeout(timer); reject(error); } };
    const timer = setTimeout(() => fail(new Error("X11 app-stall observer did not announce readiness")), 10_000);
    child.once("error", fail); child.once("close", () => fail(new Error("X11 app-stall observer exited before readiness")));
    lines.on("line", line => { try { if ((JSON.parse(line) as Trace).kind === "ready" && !readySettled) { readySettled = true; clearTimeout(timer); resolve(); } } catch (error) { fail(new Error(`Invalid X11 app-stall output: ${error}`)); } });
  });

  let actionError: unknown;
  try { await ready; await use(); } catch (error) { actionError = error; }
  let diagnosticError: Error | undefined, groupExited = false, trace: Trace[] = [], identity: Trace | undefined;
  let emergency: Awaited<ReturnType<typeof emergencyResume>> | undefined;
  const signals: string[] = [];
  const signalGroup = (name: "SIGTERM" | "SIGKILL") => { if (child.pid) try { process.kill(-child.pid, name); signals.push(name); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") signals.push(String(error)); } };
  try {
    child.stdin.end();
    const term = setTimeout(() => signalGroup("SIGTERM"), 2_000);
    const kill = setTimeout(() => signalGroup("SIGKILL"), 4_000);
    let closeTimedOut = false;
    let closeTimeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([closed, new Promise<void>(resolve => { closeTimeout = setTimeout(() => { closeTimedOut = true; signalGroup("SIGKILL"); resolve(); }, 6_000); })]);
    clearTimeout(term); clearTimeout(kill); clearTimeout(closeTimeout); lines.close();
    try { if (child.pid) process.kill(-child.pid, 0); } catch (error) { groupExited = (error as NodeJS.ErrnoException).code === "ESRCH"; }
    const output = Buffer.concat(stdout).toString();
    for (const line of output.split("\n").filter(Boolean)) {
      try { trace.push(JSON.parse(line) as Trace); }
      catch { diagnosticError = new Error("X11 app-stall diagnostic is invalid: malformed retained trace"); }
    }
    identity = trace.find(event => event.kind === "target-ready" || event.kind === "ready");
    await writeFile(join(directory, "x11-app-stall.jsonl"), output); await writeFile(join(directory, "x11-app-stall-stderr.log"), Buffer.concat(stderr));
    const trigger = trace.find(event => event.kind === "trigger"), stops = trace.filter(event => event.kind === "stop"), resumes = trace.filter(event => event.kind === "resume"), stop = stops[0], resume = resumes[0];
    if (!diagnosticError && (closeTimedOut || !groupExited || child.exitCode !== 0 || !trace.some(event => event.kind === "stopped") || !trigger || stops.length !== 1 || resumes.length !== 1 || stop?.actualStopped !== true || resume?.resumedObserved !== true || typeof resume?.actualDurationNs !== "number" || resume.actualDurationNs < 650_000_000 || resume.error || trace.some(event => event.kind === "control-error" || event.kind === "decode-error"))) diagnosticError = new Error("X11 app-stall diagnostic is invalid: missing trigger or guaranteed cleanup; inspect retained trace");
  } catch (error) { diagnosticError ??= error instanceof Error ? error : new Error(String(error)); }
  finally {
    if (!identity || !Number.isSafeInteger(identity.startTime) || identity.startTime! <= 0) diagnosticError ??= new Error("X11 app-stall diagnostic is invalid: observer did not retain exact target identity for emergency cleanup");
    else try {
      emergency = await emergencyResume(writerPid, identity.startTime!);
      await writeFile(join(directory, "x11-app-stall-emergency-resume.json"), JSON.stringify(emergency, null, 2));
      if (emergency.exitCode !== 0 || emergency.timedOut || emergency.spawnError || emergency.trace?.resumed !== true) diagnosticError ??= new Error("X11 app-stall diagnostic is invalid: parent emergency resume was not proved for the exact target");
    } catch (error) { diagnosticError ??= error instanceof Error ? error : new Error(String(error)); }
    await writeFile(join(directory, "x11-app-stall-cleanup.json"), JSON.stringify({ pid: child.pid, groupExited, exitCode: child.exitCode, signalCode: child.signalCode, signals, emergency, diagnosticError: diagnosticError?.message }, null, 2)).catch(error => { diagnosticError ??= error instanceof Error ? error : new Error(String(error)); });
  }
  if (actionError) throw actionError;
  if (diagnosticError) throw diagnosticError;
}
