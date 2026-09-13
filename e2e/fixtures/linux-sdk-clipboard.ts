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
const replacementFormats = {
  "UTF8_STRING": { type: "UTF8_STRING", width: 8, bytesHex: Buffer.from("Replacement clipboard Δ").toString("hex") },
  "text/html": { type: "text/html", width: 8, bytesHex: Buffer.from("<i>Replacement clipboard Δ</i>").toString("hex") },
  "application/x-opensky-test-binary": { type: "application/x-opensky-test-binary", width: 8, bytesHex: "deadbeef44" },
  "application/x-opensky-test-u16": { type: "INTEGER", width: 16, bytesHex: "222233335555" },
  "application/x-opensky-test-u32": { type: "CARDINAL", width: 32, bytesHex: "efbeadde04030201" },
} as const;
type CurrentParagraph = { paragraph: number };
type ObserveParagraph = (app: App) => Promise<CurrentParagraph>;
type Clipboard = {
  seed(): Promise<void>; seedRace(): Promise<void>; clear(): Promise<void>;
  read(): Promise<{ owner: number; targets: string[]; formats: Record<string, { type: string | null; width: number; bytesHex: string }> }>;
  assertReplacementOwnership(): Promise<void>;
};
type OwnerExit = { code: number | null; signal: NodeJS.Signals | null; error?: string };
const selectionText = "😀 café é one needle; two needle.";

export const test = selectionTest.extend<{ clipboard: Clipboard; observeParagraph: ObserveParagraph }>({
  observeParagraph: async ({ task }, use) => {
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "sdk-clipboard", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    let observedApp: App | undefined;
    let selectionObservationCount = 0;
    const observeParagraph: ObserveParagraph = async app => {
      observedApp = app;
      const state = await app.getAXState({ disableDiffing: true });
      const lines = state.split("\n").filter(line => line.includes(selectionText) && /^\s*- \[\d+\] paragraph\b/.test(line));
      const target = { selectionText, matches: lines, state };
      await writeFile(join(artifacts, `exact-observed-target-${++selectionObservationCount}.json`), JSON.stringify(target, null, 2));
      if (lines.length !== 1) throw new Error(`Expected one freshly observed paragraph for ${JSON.stringify(selectionText)}; found ${lines.length}`);
      return { paragraph: Number(lines[0]!.match(/\[(\d+)\]/)![1]) };
    };
    try { await use(observeParagraph); }
    finally {
      let aftermath: string | undefined;
      let observationError: string | undefined;
      if (observedApp) {
        try { aftermath = await observedApp.getAXState({ disableDiffing: true }); }
        catch (error) { observationError = String(error); }
      }
      await writeFile(join(artifacts, "selection-final-observation.json"), JSON.stringify({ aftermath, observationError }, null, 2));
    }
  },
  clipboard: async ({ task }, use) => {
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "sdk-clipboard", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const state = join(artifacts, "external-clipboard-state.json");
    const report = join(artifacts, "external-clipboard-owner-report.json");
    const replacementState = join(artifacts, "external-clipboard-replacement-state.json");
    const replacementReport = join(artifacts, "external-clipboard-replacement-report.json");
    const raceEvidence = join(artifacts, "external-clipboard-race-observation.json");
    let owner: ReturnType<typeof spawn> | undefined;
    let ownerExit: Promise<OwnerExit> | undefined;
    let ownerStderr = "";
    let ownerStarted = false;
    let raceArmed = false;
    let readCount = 0;
    const signalOwners = (signal: NodeJS.Signals) => {
      if (!owner?.pid) return;
      try { process.kill(-owner.pid, signal); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    };
    const ownersAlive = () => {
      if (!owner?.pid) return false;
      try { process.kill(-owner.pid, 0); return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
    };
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
    const seed = async (race = false) => {
      if (owner) throw new Error("External clipboard owner is already running");
      await Promise.all([state, report, replacementState, replacementReport, raceEvidence].map(path => unlink(path).catch(() => undefined)));
      const args = [helper, "--owner", state, report];
      if (race) args.push("--race", replacementState, replacementReport, raceEvidence);
      owner = spawn(process.env.OPENSKY_EVAL_PYTHON ?? "python3", args, { detached: true, stdio: ["ignore", "ignore", "pipe"] });
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
      raceArmed = race;
    };
    const assertReplacementOwnership = async () => {
      if (!raceArmed) throw new Error("Replacement ownership was not armed");
      await expect.poll(async () => access(raceEvidence).then(() => true).catch(() => false), { timeout: 10_000 }).toBe(true);
      const observation = JSON.parse(await readFile(raceEvidence, "utf8"));
      await writeFile(join(artifacts, "external-clipboard-race-validated.json"), JSON.stringify(observation, null, 2));
      if (
        observation.triggerTarget !== "application/x-opensky-test-u32"
        || observation.initialOwner === observation.replacementOwner
        || observation.ownerBeforeReply !== observation.replacementOwner
      ) {
        throw new Error(`The external X11 replacement was not observed before the original response: ${JSON.stringify(observation)}`);
      }
      const current = await read();
      expect(current.owner).toBe(observation.replacementOwner);
      expect(current.targets).toEqual(expect.arrayContaining(Object.keys(replacementFormats)));
      expect(current.formats).toEqual(replacementFormats);
    };
    try { await use({ seed: () => seed(), seedRace: () => seed(true), clear, read, assertReplacementOwnership }); }
    finally {
      let exit: OwnerExit | null = null;
      if (owner && ownerExit) {
        signalOwners("SIGTERM");
        exit = await Promise.race([ownerExit, delay(8_000).then(() => null)]);
        if (ownersAlive()) {
          signalOwners("SIGKILL");
          exit = await Promise.race([ownerExit, delay(2_000).then(() => null)]);
        }
      }
      await writeFile(join(artifacts, "external-clipboard-owner.stderr.log"), ownerStderr);
      const ownerReport = await readFile(report, "utf8").then(JSON.parse).catch(() => null);
      const replacementReportExists = await access(replacementReport).then(() => true).catch(() => false);
      const cleanup = {
        ownerStopped: !owner || (exit !== null && !exit.error && !ownersAlive()),
        childStopped: !raceArmed || ownerReport?.raceChild?.stopped === true,
        exit,
        reportExists: await access(report).then(() => true).catch(() => false),
        replacementReportExists,
      };
      await writeFile(join(artifacts, "external-clipboard-cleanup.json"), JSON.stringify(cleanup, null, 2));
      if (!cleanup.ownerStopped || !cleanup.childStopped || (ownerStarted && !cleanup.reportExists) || (raceArmed && !cleanup.replacementReportExists)) {
        throw new Error("External clipboard fixture cleanup was not verified");
      }
    }
  },
});

export async function selectPasteTarget(app: App, observeParagraph: ObserveParagraph): Promise<void> {
  const current = await observeParagraph(app);
  await app.selectText(current.paragraph, selectionText);
}

export { expectedFormats };
