import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createCua, createOpenSky } from "../../../src/index.js";
import { withOwnedLinuxApp } from "../linux-app.js";
import { runCodex } from "../codex.js";
import { prepareLinuxBenchmarkApp } from "../linux-benchmark-app.js";
import { verifyScoringProfile } from "../scoring-profile.js";
import { runProfile } from "../run-profile.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(root, "../../..");
const [taskId, backend, output] = process.argv.slice(2);
if (process.platform !== "linux" || process.env.GITHUB_ACTIONS !== "true" || !output || !["native", "opensky", "setup"].includes(backend)) throw new Error("Use linux-smoke.ts TASK_ID native|opensky|setup ARTIFACTS on disposable Linux CI");
const artifacts = resolve(output);
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const task = manifest.tasks.find((task: { id: string }) => task.id === taskId);
if (!task) throw new Error("Unknown Linux benchmark task");
const isCode = task.category === "vs_code";
if (isCode && !process.env.OPENSKY_EVAL_VSCODE) throw new Error("Provide OPENSKY_EVAL_VSCODE for editor tasks");
const environment = JSON.parse(await readFile(join(artifacts, "environment.json"), "utf8"));
if (isCode && !environment.vsCode) throw new Error("Editor installation fingerprint required before dispatch");
const runtime = JSON.parse(await readFile(join(artifacts, "driver-runtime.json"), "utf8"));
const nativeTransport = JSON.parse(await readFile(join(artifacts, "native-repl-probe.json"), "utf8"));
if (environment.platform !== "linux" || !runtime.ready || !nativeTransport.passed) throw new Error("Verified Linux runtime, fingerprint and native agent transport required");
const nativeConfig = join(artifacts, "native-repl-config.json");
const nativeConfiguration = JSON.parse(await readFile(nativeConfig, "utf8"));
const nativeResources = resolve(nativeConfiguration.command, "../../..");
const driver = process.env.OPENSKY_DRIVER_BINARY!;
const python = process.env.OPENSKY_EVAL_PYTHON!;
const profile = runProfile();
const scoringProfilePath = process.env.OPENSKY_EVAL_SCORING_PROFILE;
if (!scoringProfilePath && (task.category === "libreoffice_impress" || process.env.OPENSKY_EVAL_SCORING_PROFILE_SHA256)) {
  throw new Error("A frozen, validated Linux scoring profile is required for Impress");
}
const scoringProfile = scoringProfilePath ? await verifyScoringProfile({
  python, officeExecutable: "/usr/lib/libreoffice/program/soffice", profilePath: scoringProfilePath,
  expectedSha256: process.env.OPENSKY_EVAL_SCORING_PROFILE_SHA256,
}) : { name: "upstream-pinned-v1", sha256: null };
if (scoringProfilePath && environment.scoringProfile?.sha256 !== scoringProfile.sha256) {
  throw new Error("Scoring profile differs from the captured environment");
}
await writeFile(join(artifacts, "scoring-profile.json"), JSON.stringify(scoringProfile, null, 2), { flag: "wx" });
for (const asset of task.assets) {
  const bytes = await readFile(join(root, taskId, asset.file));
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error(`Task asset changed: ${asset.file}`);
}
await writeFile(join(artifacts, "run-profile.json"), JSON.stringify(profile, null, 2), { flag: "wx" });
const temporary = await mkdtemp(join(tmpdir(), "opensky-linux-agent-"));
const document = join(temporary, task.inputFile);
await copyFile(join(root, taskId, task.inputFile), document);
let error: unknown;
let score: Record<string, any> | undefined;
try {
  const launch = await prepareLinuxBenchmarkApp({ category: task.category, document, temporary, artifacts, vscodePath: process.env.OPENSKY_EVAL_VSCODE });
  await withOwnedLinuxApp(launch.options, async () => {
    let sdk: ReturnType<typeof createOpenSky> | undefined;
    try {
      let screenshot: () => Promise<Uint8Array>;
      if (backend === "opensky") {
        sdk = createOpenSky({ homeDir: join(temporary, "readiness-sdk"), autoLaunch: false,
          driverOptions: { binaryPath: driver, socket: process.env.OPENSKY_DRIVER_SOCKET, autoInstall: false, autoStart: false } });
        const app = await createCua(sdk).getApp(launch.appName);
        screenshot = () => app.getScreenshot({ emit: false });
      } else {
        const packageRoot = process.env.OPENSKY_NATIVE_PROBE_PACKAGE!;
        const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
        const { sky } = await import(pathToFileURL(join(packageRoot, metadata.main)).href);
        screenshot = async () => (await sky.get_screenshot())[0].bytes;
      }
      let ready = false;
      const deadline = Date.now() + 20_000;
      for (let sequence = 1; Date.now() < deadline; sequence++) {
        const path = join(artifacts, `readiness-${sequence}.${backend === "opensky" ? "png" : "jpg"}`);
        await writeFile(path, await screenshot());
        const text = (await exec("tesseract", [path, "stdout", "--psm", "11"], { timeout: 10_000 })).stdout;
        await writeFile(`${path}.txt`, text);
        if (launch.menus.every(menu => new RegExp(`\\b${menu}\\b`).test(text))) { ready = true; break; }
        await delay(250);
      }
      if (!ready) throw new Error("Editor controls did not become visible; agent not dispatched");
    } finally { await sdk?.close(); }
    if (backend === "setup") return;
    const scope = { backend: backend as "native" | "opensky", appSelectors: [launch.appName], isolatedDesktop: "linux" as const };
    const mcp = {
      command: process.execPath,
      args: ["--import", join(repo, "node_modules/tsx/dist/loader.mjs"), join(root, `../${backend}-mcp.ts`)],
      env: {
        PARITY_DESKTOP_SCOPE: JSON.stringify(scope), OPENSKY_HOME: join(artifacts, "agent-sdk"),
        OPENSKY_DRIVER_BINARY: driver, OPENSKY_DRIVER_SOCKET: process.env.OPENSKY_DRIVER_SOCKET!,
        OPENSKY_OWNED_DRIVER_PID: process.env.OPENSKY_OWNED_DRIVER_PID!, GITHUB_ACTIONS: "true",
        OPENSKY_NATIVE_REPL_CONFIG: nativeConfig,
      },
      enabled_tools: backend === "native" ? ["js"] : ["cua_repl"],
    };
    const guide = backend === "native" ? await readFile(join(root, "../native-linux-guide.md"), "utf8") :
      `Use desktop.cua_repl. Bind let app = await cua.getApp(${JSON.stringify(launch.appName)}); then use its public methods and fresh observations. Creation and observations emit automatically.`;
    const result = await runCodex({ codex: join(nativeResources, "codex"), model: "gpt-5.6-terra", authentication: "api-key",
      budgetPath: process.env.OPENSKY_REMOTE_BUDGET, preReservedId: process.env.OPENSKY_REMOTE_RESERVATION,
      artifacts, cwd: join(artifacts, "agent-workspace"), timeoutMs: profile.timeoutMs, maxToolCalls: profile.maxToolCalls,
      mcp, authorizedApps: { [launch.appName]: launch.appName }, desktopProgramScope: scope,
      prompt: `Task: ${task.instruction}\nYou are using Ubuntu Linux. The document ${task.inputFile} is already open in ${launch.appName}. Save your changes to this same file, preserving its existing format and unrelated content. Use only this owned ${launch.appName} instance. Do not open other documents/apps, run macros/commands, access network services, use the clipboard, or quit the app. Cleanup is handled afterward.\n${guide}\nFinish when saved, or report the specific blocker.`,
    });
    const savedFileOutcome = JSON.parse((await exec(python, [join(root, "score.py"), taskId, document,
      ...(scoringProfilePath ? ["--profile", scoringProfilePath, "--expected-profile-sha256", scoringProfile.sha256!] : []),
    ], { timeout: 30_000 })).stdout);
    score = { taskId, backend, suite: "osworld-verified-linux-desktop", upstreamCommit: manifest.upstreamCommit,
      profile, scoringProfile,
      outcome: { ...savedFileOutcome, taskSuccess: savedFileOutcome.taskSuccess && !result.taskLimit }, savedFileOutcome,
      rawOutcome: savedFileOutcome.rawOutcome ?? savedFileOutcome, adaptedOutcome: savedFileOutcome.adaptedOutcome ?? null,
      infrastructureError: result.infrastructureError, taskLimit: result.taskLimit, usage: result.usage,
      toolCalls: result.toolCalls, admittedCalls: result.admission?.admittedCalls, contextCompactions: result.contextCompactions,
      elapsedMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt),
    };
    await writeFile(join(artifacts, "score.json"), JSON.stringify(score, null, 2));
    await copyFile(document, join(artifacts, task.inputFile)).catch(cause => { if (cause.code !== "ENOENT") throw cause; });
  });
} catch (cause) { error = cause; throw cause; }
finally {
  await copyFile(document, join(artifacts, task.inputFile)).catch(cause => { if (cause.code !== "ENOENT") throw cause; });
  const cleanup = await readFile(join(artifacts, "cleanup.json"), "utf8").then(JSON.parse).catch(() => null);
  const temporaryRemoved = cleanup?.status === "passed" && cleanup.verifiedExited;
  if (temporaryRemoved) await rm(temporary, { recursive: true, force: true });
  await writeFile(join(artifacts, "run-status.json"), JSON.stringify({
    taskId, backend, platform: "linux", cleanup, temporaryRemoved,
    infrastructureError: error ? String(error) : score?.infrastructureError ?? null,
    validEvaluation: backend !== "setup" && !!score && !error && !score.infrastructureError && temporaryRemoved,
  }, null, 2));
}
