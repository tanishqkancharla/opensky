import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { test as selectionTest } from "./linux-selection.js";

const exec = promisify(execFile);
const helper = fileURLToPath(new URL("./linux-x11-clipboard.py", import.meta.url));
const expectedFormats = {
  "UTF8_STRING": { type: "UTF8_STRING", width: 8, bytesHex: Buffer.from("Original clipboard Ω").toString("hex") },
  "text/html": { type: "text/html", width: 8, bytesHex: Buffer.from("<b>Original clipboard</b>").toString("hex") },
  "application/x-opensky-test-binary": { type: "application/x-opensky-test-binary", width: 8, bytesHex: "00ff110080" },
  "application/x-opensky-test-u16": { type: "INTEGER", width: 16, bytesHex: "0000ffff3412" },
  "application/x-opensky-test-u32": { type: "CARDINAL", width: 32, bytesHex: "00000000ffffffff78563412" },
} as const;
type Clipboard = { seed(): Promise<void>; clear(): Promise<void>; read(): Promise<{ owner: number; targets: string[]; formats: Record<string, { type: string | null; width: number; bytesHex: string }> }> };

export const test = selectionTest.extend<{ clipboard: Clipboard }>({
  clipboard: async ({ task }, use) => {
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "sdk-clipboard", task.name.split(":")[0]);
    await mkdir(artifacts, { recursive: true });
    const state = join(artifacts, "external-clipboard-state.json");
    const report = join(artifacts, "external-clipboard-owner-report.json");
    let owner: ReturnType<typeof spawn> | undefined;
    const read = async () => JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [helper, "--read"])).stdout) as Awaited<ReturnType<Clipboard["read"]>>;
    const clear = async () => {
      const result = JSON.parse((await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [helper, "--clear"])).stdout);
      await writeFile(join(artifacts, "external-clipboard-cleared.json"), JSON.stringify(result, null, 2));
      expect(result).toEqual({ owner: 0 });
    };
    const seed = async () => {
      if (owner) throw new Error("External clipboard owner is already running");
      await unlink(state).catch(() => undefined); await unlink(report).catch(() => undefined);
      owner = spawn(process.env.OPENSKY_EVAL_PYTHON ?? "python3", [helper, "--owner", state, report], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = ""; owner.stderr.on("data", data => { stderr += data; });
      await expect.poll(async () => access(state).then(() => true).catch(() => false), { timeout: 10_000 }).toBe(true);
      const seeded = JSON.parse(await readFile(state, "utf8"));
      await writeFile(join(artifacts, "external-clipboard-seeded.json"), JSON.stringify(seeded, null, 2));
      expect(seeded.formats).toHaveLength(5);
      if (stderr) throw new Error(`External clipboard owner failed: ${stderr}`);
    };
    try { await use({ seed, clear, read }); }
    finally {
      if (owner && owner.exitCode === null) owner.kill("SIGTERM");
      if (owner) await new Promise<void>((resolveExit, reject) => { owner!.once("exit", () => resolveExit()); owner!.once("error", reject); });
      const cleanup = { ownerStopped: !owner || owner.exitCode !== null, reportExists: await access(report).then(() => true).catch(() => false) };
      await writeFile(join(artifacts, "external-clipboard-cleanup.json"), JSON.stringify(cleanup, null, 2));
      if (!cleanup.ownerStopped || (owner && !cleanup.reportExists)) throw new Error("External clipboard fixture cleanup was not verified");
    }
  },
});

export { expectedFormats };
