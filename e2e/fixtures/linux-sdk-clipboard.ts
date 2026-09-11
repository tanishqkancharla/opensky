import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { expect } from "vitest";
import { test as selectionTest } from "./linux-selection.js";
import type { App } from "../../src/cua.js";

const exec = promisify(execFile);
const helper = fileURLToPath(new URL("./linux-x11-clipboard.py", import.meta.url));
const expectedFormats = {
  "UTF8_STRING": { type: "UTF8_STRING", width: 8, bytesHex: Buffer.from("Original clipboard Ω").toString("hex") },
  "text/html": { type: "text/html", width: 8, bytesHex: Buffer.from("<b>Original clipboard</b>").toString("hex") },
  "application/x-opensky-test-binary": { type: "application/x-opensky-test-binary", width: 8, bytesHex: "00ff110080" },
  "application/x-opensky-test-u16": { type: "INTEGER", width: 16, bytesHex: "0000ffff3412" },
  "application/x-opensky-test-u32": { type: "CARDINAL", width: 32, bytesHex: "00000000ffffffff78563412" },
} as const;
type CurrentParagraph = { app: App; paragraph: number };
type Clipboard = {
  seed(): Promise<void>; clear(): Promise<void>;
  read(): Promise<{ owner: number; targets: string[]; formats: Record<string, { type: string | null; width: number; bytesHex: string }> }>;
  observeCurrentParagraph(app: App): Promise<CurrentParagraph>;
  recordSelectionFailure(app: App, error: unknown): Promise<void>;
};
type OwnerExit = { code: number | null; signal: NodeJS.Signals | null; error?: string };
const selectionText = "😀 café é one needle; two needle.";

export const test = selectionTest.extend<{ clipboard: Clipboard }>({
  clipboard: async ({ task }, use) => {
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "sdk-clipboard", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const state = join(artifacts, "external-clipboard-state.json");
    const report = join(artifacts, "external-clipboard-owner-report.json");
    let owner: ReturnType<typeof spawn> | undefined;
    let ownerExit: Promise<OwnerExit> | undefined;
    let ownerStderr = "";
    let ownerStarted = false;
    let readCount = 0;
    let selectionObservationCount = 0;
    const read = async () => {
      const result = JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [helper, "--read"])).stdout) as Awaited<ReturnType<Clipboard["read"]>>;
      await writeFile(join(artifacts, `external-clipboard-read-${++readCount}.json`), JSON.stringify(result, null, 2));
      return result;
    };
    const clear = async () => {
      const result = JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [helper, "--clear"])).stdout);
      await writeFile(join(artifacts, "external-clipboard-cleared.json"), JSON.stringify(result, null, 2));
      expect(result).toEqual({ owner: 0 });
    };
    const observeCurrentParagraph = async (app: App): Promise<CurrentParagraph> => {
      const state = await app.getAXState({ disableDiffing: true });
      const lines = state.split("\n").filter(line => line.includes(selectionText) && /^\s*- \[\d+\] paragraph\b/.test(line));
      const target = { selectionText, matches: lines, state };
      await writeFile(join(artifacts, `exact-observed-target-${++selectionObservationCount}.json`), JSON.stringify(target, null, 2));
      if (lines.length !== 1) throw new Error(`Expected one freshly observed paragraph for ${JSON.stringify(selectionText)}; found ${lines.length}`);
      const paragraph = Number(lines[0]!.match(/\[(\d+)\]/)![1]);
      return { app, paragraph };
    };
    const recordSelectionFailure = async (app: App, error: unknown): Promise<void> => {
      let aftermath: string | undefined;
      let observationError: string | undefined;
      try { aftermath = await app.getAXState({ disableDiffing: true }); }
      catch (captureError) { observationError = String(captureError); }
      await writeFile(join(artifacts, "selection-failure-aftermath.json"), JSON.stringify({ error: String(error), aftermath, observationError }, null, 2));
    };
    const seed = async () => {
      if (owner) throw new Error("External clipboard owner is already running");
      await unlink(state).catch(() => undefined); await unlink(report).catch(() => undefined);
      owner = spawn(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [helper, "--owner", state, report], { stdio: ["ignore", "ignore", "pipe"] });
      // Attach lifecycle listeners immediately: a failed spawn can emit exit
      // before fixture setup reaches its readiness poll.
      ownerExit = new Promise(resolve => {
        owner!.once("exit", (code, signal) => resolve({ code, signal }));
        owner!.once("error", error => resolve({ code: owner!.exitCode, signal: owner!.signalCode, error: String(error) }));
      });
      owner.stderr?.on("data", data => { ownerStderr += data; });
      await Promise.race([
        expect.poll(async () => access(state).then(() => true).catch(() => false), { timeout: 10_000 }).toBe(true),
        ownerExit.then(exit => { throw new Error(`External clipboard owner exited before readiness: ${JSON.stringify(exit)} ${ownerStderr}`); }),
      ]);
      const seeded = JSON.parse(await readFile(state, "utf8"));
      if (owner.exitCode !== null || owner.signalCode !== null) {
        throw new Error(`External clipboard owner exited after readiness: ${JSON.stringify(await ownerExit)}`);
      }
      await writeFile(join(artifacts, "external-clipboard-seeded.json"), JSON.stringify(seeded, null, 2));
      expect(seeded.formats).toHaveLength(5);
      if (ownerStderr) throw new Error(`External clipboard owner failed: ${ownerStderr}`);
      ownerStarted = true;
    };
    try { await use({ seed, clear, read, observeCurrentParagraph, recordSelectionFailure }); }
    finally {
      let exit: OwnerExit | null = null;
      if (owner && ownerExit) {
        if (owner.exitCode === null && owner.signalCode === null) owner.kill("SIGTERM");
        exit = await Promise.race([ownerExit, delay(5_000).then(() => null)]);
        if (!exit && owner.exitCode === null && owner.signalCode === null) {
          owner.kill("SIGKILL");
          exit = await Promise.race([ownerExit, delay(2_000).then(() => null)]);
        }
      }
      await writeFile(join(artifacts, "external-clipboard-owner.stderr.log"), ownerStderr);
      const cleanup = { ownerStopped: !owner || (exit !== null && !exit.error), exit, reportExists: await access(report).then(() => true).catch(() => false) };
      await writeFile(join(artifacts, "external-clipboard-cleanup.json"), JSON.stringify(cleanup, null, 2));
      if (!cleanup.ownerStopped || (ownerStarted && !cleanup.reportExists)) throw new Error("External clipboard fixture cleanup was not verified");
    }
  },
});

export { expectedFormats };
