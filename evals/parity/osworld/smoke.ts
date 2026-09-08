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
import { recordEnvironment } from "../fingerprint.js";
import { runProfile } from "../run-profile.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(root, "../../..");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const taskId = process.argv[2];
const backend = process.argv[3];
const artifacts = resolve(process.argv[4]!);
const profileLimits = runProfile(process.argv[5]);
const task = manifest.tasks.find((task: { id: string }) => task.id === taskId);
if (!task || !["native", "opensky", "setup"].includes(backend!)) throw new Error("Use smoke.ts TASK_ID native|opensky|setup ARTIFACTS");
const python = process.env.OPENSKY_EVAL_PYTHON;
const libreOfficePath = process.env.OPENSKY_EVAL_LIBREOFFICE;
const vscodePath = process.env.OPENSKY_EVAL_VSCODE;
const isCode = task.category === "vs_code";
const appPath = isCode ? vscodePath : libreOfficePath;
const driver = process.env.OPENSKY_DRIVER_BINARY;
if (!python || !appPath || !libreOfficePath || !driver) throw new Error("Set OPENSKY_EVAL_PYTHON, OPENSKY_EVAL_LIBREOFFICE, OPENSKY_DRIVER_BINARY and (for editor tasks) OPENSKY_EVAL_VSCODE");
for (const asset of task.assets) {
  const bytes = await readFile(join(root, task.id, asset.file));
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error(`Task asset changed: ${asset.file}`);
}
await mkdir(artifacts, { recursive: true });
await writeFile(join(artifacts, "run-profile.json"), JSON.stringify(profileLimits, null, 2), { flag: "wx" });
await recordEnvironment({ repo, appPath: libreOfficePath, vscodePath, driver, python, artifacts, nativeConfig: backend === "native" ? process.env.OPENSKY_NATIVE_REPL_CONFIG : undefined });
const environment = JSON.parse(await readFile(join(artifacts, "environment.json"), "utf8"));
const temporary = await mkdtemp(join(tmpdir(), "opensky-osworld-"));
const document = join(temporary, task.inputFile);
await copyFile(join(root, task.id, task.inputFile), document);
const profile = join(temporary, "profile");
const bundleId = isCode ? "com.microsoft.VSCode" : "org.libreoffice.script";
const appName = isCode ? "Visual Studio Code" : "LibreOffice";
// Native discovery considers installed copies, not only running processes.
// VS Code extension-test installations can share its bundle identifier.
// Give both agents the exact owned installation through the public selector.
const appSelector = isCode ? appPath : bundleId;
const launchArguments = isCode
  ? ["--user-data-dir", profile, "--extensions-dir", join(temporary, "extensions"), "--disable-extensions", "--skip-welcome", "--skip-release-notes", "--new-window", document]
  : [`-env:UserInstallation=${pathToFileURL(profile).href}`, "--norestore", "--nologo", task.category === "libreoffice_calc" ? "--calc" : task.category === "libreoffice_impress" ? "--impress" : "--writer", document];
if (isCode) {
  await mkdir(join(profile, "User"), { recursive: true });
  await writeFile(join(profile, "User/settings.json"), JSON.stringify({ "update.mode": "none", "telemetry.telemetryLevel": "off", "workbench.startupEditor": "none" }));
}
const scope = { backend: backend === "native" ? "native" : "opensky", appSelectors: [bundleId, appName, appPath] } as const;
let cleaned = false;
let runError: unknown;
try {
  await withOwnedMacApp({ bundleId, appPath, artifacts, disposableProfile: true, launchEnvironment: { PYTHONDONTWRITEBYTECODE: "1" }, launchArguments }, async owned => {
      const deadline = Date.now() + 30_000;
      let state;
      let activation;
      do {
        state = await owned.inspect();
        if (state.finishedLaunching && state.windows.some(window => window.onScreen && window.title.includes(task.inputFile))) break;
        if (activation === undefined && state.windows.some(window => window.title.includes(task.inputFile))) activation = await owned.activate();
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
        ? (await readFile(join(root, "../native-guide.md"), "utf8")).replaceAll('"org.libreoffice.script"', JSON.stringify(appSelector))
        : `Use desktop.cua_repl. Bind let app = await cua.getApp(${JSON.stringify(appSelector)}); then use the public app methods and fresh observations. Creation and observations emit automatically.`;
      const result = await runCodex({ model: "gpt-5.6-terra", artifacts, cwd: join(artifacts, "agent-workspace"), timeoutMs: profileLimits.timeoutMs, maxToolCalls: profileLimits.maxToolCalls, mcp, authorizedApps: { [bundleId]: appName, [appPath]: appName }, desktopProgramScope: { ...scope, appSelectors: [...scope.appSelectors] },
        prompt: `Task: ${task.instruction}\nYou are using macOS ${environment.osVersion}. The document ${task.inputFile} is already open in ${appName}. Save your changes to this same file, preserving its existing format and unrelated content. Use only this owned ${appName} instance. Do not open other documents/apps, run macros/commands, access network services, use the clipboard, or quit the app. Cleanup is handled afterward.\n${guide}\nUse straight-line public UI calls and simple variable bindings, without helper functions, loops or other imports. Use fresh observed indices or screenshots; never invent element indices. Finish when saved, or report the specific blocker.`,
      });
      const savedFileOutcome = JSON.parse((await exec(python, [join(root, "score.py"), task.id, document], { timeout: 15_000 })).stdout);
      // Never award success for edits completed after an interrupted deadline.
      // Preserve the actual file grader independently from the task allowance.
      const outcome = { ...savedFileOutcome, taskSuccess: savedFileOutcome.taskSuccess && !result.taskLimit };
      await copyFile(document, join(artifacts, task.inputFile)).catch(error => {
        if (error.code !== "ENOENT") throw error;
        // Deletion is a saved-file failure, not a missing infrastructure result.
      });
      const report = { taskId, backend, profile: profileLimits, suite: manifest.suite, upstreamCommit: manifest.upstreamCommit, adaptations: manifest.adaptations, outcome, savedFileOutcome, taskLimit: result.taskLimit, infrastructureError: result.infrastructureError, toolCalls: result.toolCalls, admittedCalls: result.admission?.admittedCalls ?? null, contextCompactions: result.contextCompactions, usage: result.usage, elapsedMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt) };
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
