import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { withOwnedMacApp } from "../mac-app.js";
import { runCodex } from "../codex.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(root, "../../..");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const taskId = process.argv[2];
const backend = process.argv[3];
const artifacts = resolve(process.argv[4]!);
const task = manifest.tasks.find((task: { id: string }) => task.id === taskId);
if (!task || !["native", "opensky", "setup"].includes(backend!)) throw new Error("Use smoke.ts TASK_ID native|opensky|setup ARTIFACTS");
const python = process.env.OPENSKY_EVAL_PYTHON;
const appPath = process.env.OPENSKY_EVAL_LIBREOFFICE;
const driver = process.env.OPENSKY_DRIVER_BINARY;
if (!python || !appPath || !driver) throw new Error("Set OPENSKY_EVAL_PYTHON, OPENSKY_EVAL_LIBREOFFICE and OPENSKY_DRIVER_BINARY");
for (const asset of task.assets) {
  const bytes = await readFile(join(root, task.id, asset.file));
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error(`Task asset changed: ${asset.file}`);
}
await mkdir(artifacts, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "opensky-osworld-"));
const document = join(temporary, task.inputFile);
await copyFile(join(root, task.id, task.inputFile), document);
const profile = join(temporary, "profile");
const bundleId = "org.libreoffice.script";
const scope = { backend: backend === "native" ? "native" : "opensky", appSelectors: [bundleId, "LibreOffice"] } as const;
let cleaned = false;
let runError: unknown;
try {
  await withOwnedMacApp({ bundleId, appPath, artifacts, disposableProfile: true, launchEnvironment: { PYTHONDONTWRITEBYTECODE: "1" }, launchArguments: [`-env:UserInstallation=${pathToFileURL(profile).href}`, "--norestore", "--nologo", "--writer", document] }, async owned => {
      const deadline = Date.now() + 30_000;
      let state;
      do {
        state = await owned.inspect();
        if (state.finishedLaunching && state.windows.some(window => window.onScreen && window.title.includes(task.inputFile))) break;
        await delay(250);
      } while (Date.now() < deadline);
      if (!state) throw new Error("No fixture app state available");
      await writeFile(join(artifacts, "initial-state.json"), JSON.stringify(state, null, 2));
      if (!state.finishedLaunching || !state.windows.some(window => window.onScreen && window.title.includes(task.inputFile))) throw new Error("Fixture document not ready; do not dispatch an agent");
      if (backend === "setup") {
        console.log(JSON.stringify({ setup: "passed", state }));
        return;
      }
      const nativeConfig = process.env.OPENSKY_NATIVE_REPL_CONFIG;
      if (backend === "native" && !nativeConfig) throw new Error("Provide OPENSKY_NATIVE_REPL_CONFIG");
      const mcp = {
        command: process.execPath,
        args: ["--import", join(repo, "node_modules/tsx/dist/loader.mjs"), join(root, `../${backend === "native" ? "native" : "opensky"}-mcp.ts`)],
        env: { PARITY_DESKTOP_SCOPE: JSON.stringify(scope), OPENSKY_HOME: join(artifacts, "agent-sdk"), OPENSKY_DRIVER_BINARY: driver, ...(nativeConfig ? { OPENSKY_NATIVE_REPL_CONFIG: nativeConfig } : {}) },
        enabled_tools: backend === "native" ? ["js"] : ["cua_repl"],
      };
      const guide = backend === "native"
        ? await readFile(join(root, "../native-guide.md"), "utf8")
        : 'Use desktop.cua_repl. Bind let app = await cua.getApp("org.libreoffice.script"); then use the public app methods and fresh observations. Creation and observations emit automatically.';
      const result = await runCodex({ model: "gpt-5.6-terra", artifacts, cwd: join(artifacts, "agent-workspace"), timeoutMs: 240_000, maxToolCalls: 20, mcp, authorizedApps: { [bundleId]: "LibreOffice" }, desktopProgramScope: { ...scope, appSelectors: [...scope.appSelectors] },
        prompt: `Task: ${task.instruction}\nThe document ${task.inputFile} is already open in LibreOffice. Save your changes to this same document in its existing DOCX format. Preserve unrelated content. Use only this owned LibreOffice instance. Do not open other documents/apps, run macros/commands, access network services, use the clipboard, or quit the app. Cleanup is handled afterward.\n${guide}\nUse straight-line public UI calls and simple variable bindings, without helper functions, loops or other imports. Use fresh observed indices or screenshots; never invent element indices. Finish when saved, or report the specific blocker.`,
      });
      const outcome = JSON.parse((await exec(python, [join(root, "score.py"), task.id, document], { timeout: 15_000 })).stdout);
      await copyFile(document, join(artifacts, task.inputFile));
      const report = { taskId, backend, suite: manifest.suite, upstreamCommit: manifest.upstreamCommit, adaptations: manifest.adaptations, outcome, infrastructureError: result.interruption ?? (result.turn.status !== "completed" ? result.turn.status : null), toolCalls: result.toolCalls, usage: result.usage, elapsedMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt) };
      await writeFile(join(artifacts, "score.json"), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
  });
  cleaned = true;
} catch (error) {
  runError = error;
  throw error;
} finally {
  const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
  let temporaryRemoved = false;
  try {
    if (cleaned || cleanup?.status === "passed") {
      await rm(temporary, { recursive: true, force: true });
      temporaryRemoved = true;
    } else console.error(`Cleanup needs verification; retained ${temporary}`);
  } finally {
    const score = await readFile(join(artifacts, "score.json"), "utf8").then(JSON.parse).catch(() => null);
    // Gate on the fixture separately from the saved-file task outcome. A real
    // task failure with trustworthy setup/cleanup is still useful evidence.
    await writeFile(join(artifacts, "run-status.json"), JSON.stringify({
      backend, taskId, cleanup, temporaryRemoved,
      infrastructureError: runError ? String(runError) : score?.infrastructureError ?? null,
      validEvaluation: backend !== "setup" && !!score && !runError && !score.infrastructureError && cleanup?.status === "passed" && temporaryRemoved,
    }, null, 2));
  }
}
