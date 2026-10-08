import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createCua, createOpenSky } from "../../../src/index.js";
import { assertDisposableLinuxDesktop, withOwnedLinuxApp } from "../linux-app.js";
import { runCodex } from "../codex.js";
import { prepareLinuxBenchmarkApp } from "../linux-benchmark-app.js";
import { verifyScoringProfile } from "../scoring-profile.js";
import { runProfile } from "../run-profile.js";
import { captureLinuxFinalObservation } from "../linux-final-observation.js";
import { verifiedLinuxAppSelectors } from "../linux-app-selectors.js";
import { matchedLinuxPrompt } from "../linux-prompt.js";
import { withNativeLinuxRepl, withLinuxRepl } from "../native-linux-repl.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(root, "../../..");
const [taskId, backend, output] = process.argv.slice(2);
assertDisposableLinuxDesktop();
if (!output || !["native", "opensky", "setup"].includes(backend)) throw new Error("Use linux-smoke.ts TASK_ID native|opensky|setup ARTIFACTS on a disposable Linux desktop");
const authentication = process.env.OPENSKY_EVAL_AUTHENTICATION ?? "api-key";
if (authentication !== "api-key" && authentication !== "chatgpt-subscription") throw new Error("OPENSKY_EVAL_AUTHENTICATION must be api-key or chatgpt-subscription");
const explicitDockerDesktop = process.env.OPENSKY_DISPOSABLE_DESKTOP === "1" && existsSync("/.dockerenv");
if (authentication === "chatgpt-subscription" && (process.env.GITHUB_ACTIONS === "true" || !explicitDockerDesktop)) {
  throw new Error("ChatGPT subscription evaluation requires an explicit disposable Docker desktop outside CI");
}
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
const codex = process.env.OPENSKY_EVAL_CODEX ?? join(nativeResources, "codex");
const codexSha256 = createHash("sha256").update(await readFile(codex)).digest("hex");
if (environment.codex?.sha256 !== codexSha256) throw new Error("The Codex binary differs from the setup environment fingerprint");
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
  await withOwnedLinuxApp(launch.options, async (owned) => {
    const verifyReady = async (screenshot: () => Promise<Uint8Array>, name: string) => {
      let ready = false;
      const deadline = Date.now() + 20_000;
      for (let sequence = 1; Date.now() < deadline; sequence++) {
        const path = join(artifacts, `readiness-${name}-${sequence}.png`);
        await writeFile(path, await screenshot());
        const text = (await exec("tesseract", [path, "stdout", "--psm", "11"], {
          timeout: 10_000, env: { ...process.env, OMP_THREAD_LIMIT: "1" },
        })).stdout;
        await writeFile(`${path}.txt`, text);
        if (launch.menus.every(menu => new RegExp(`\\b${menu}\\b`).test(text))) { ready = true; break; }
        await delay(250);
      }
      if (!ready) throw new Error(`${name} editor controls did not become visible; agent not dispatched`);
    };
    let appSelectors = [launch.appName];
    if (backend === "opensky" || backend === "setup") {
      const sdk = createOpenSky({ homeDir: join(temporary, "readiness-sdk"), autoLaunch: false,
        driverOptions: { binaryPath: driver, socket: process.env.OPENSKY_DRIVER_SOCKET, autoInstall: false, autoStart: false } });
      try {
        const cua = createCua(sdk);
        const selectors = await verifiedLinuxAppSelectors(cua, launch.appName);
        appSelectors = selectors.appSelectors;
        await writeFile(join(artifacts, "app-selector-proof.json"), JSON.stringify(selectors, null, 2), { flag: "wx" });
        const app = await cua.getApp(launch.appName);
        await verifyReady(() => app.getScreenshot({ emit: false }), "opensky");
      } finally { await sdk.close(); }
      const directory = join(artifacts, "opensky-agent-readiness"); await mkdir(directory);
      await withLinuxRepl({
        command: process.execPath,
        args: ["--import", join(repo, "node_modules/tsx/dist/loader.mjs"), join(root, "../opensky-mcp.ts")],
        // Match the real isolated agent environment. No GitHub identity or
        // credentials are inherited by the MCP verifier child.
        env: { ...Object.fromEntries(["DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS"]
          .flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]!]])),
          OPENSKY_HOME: join(directory, "sdk"), OPENSKY_DRIVER_BINARY: driver,
          OPENSKY_DRIVER_SOCKET: process.env.OPENSKY_DRIVER_SOCKET!,
          OPENSKY_OWNED_DRIVER_PID: process.env.OPENSKY_OWNED_DRIVER_PID!,
          OPENSKY_VERIFIED_LINUX_DRIVER: JSON.stringify(runtime.linuxIdentity),
          PARITY_DESKTOP_SCOPE: JSON.stringify({ backend: "opensky", appSelectors, isolatedDesktop: "linux" }) },
      }, directory, async cell => {
        // Keep advertised inventory usable through the actual agent guard,
        // before selecting and observing the fixture's bound app.
        await cell('await cua.getState();');
        await cell(`var app = await cua.getApp(${JSON.stringify(appSelectors.at(-1))});`);
        const observed = await cell('await app.getScreenshot();');
        const image = observed.content?.find(item => item.type === "image" && item.data);
        if (!image) throw new Error("Genuine OpenSky agent transport did not deliver the owned document screenshot");
        await writeFile(join(directory, "owned-window-image.bin"), Buffer.from(image.data!, "base64"));
      }, { toolName: "cua_repl", artifactPrefix: "opensky-agent-repl" });
    }
    if (backend === "native" || backend === "setup") {
      if (nativeTransport.interface !== "current-cua-facade") throw new Error("Current native CUA facade was not verified; no legacy reference is substituted");
      const directory = join(artifacts, "native-readiness"); await mkdir(directory);
      const configuration = JSON.parse(await readFile(nativeConfig, "utf8"));
      // Exercise the same guarded transport used by the native agent. A
      // rejected bootstrap must explain how to obtain the original API help,
      // and must not prevent the next genuine initialization/observation.
      const guardedConfiguration = {
        command: process.execPath,
        args: ["--import", join(repo, "node_modules/tsx/dist/loader.mjs"), join(root, "../native-mcp.ts")],
        env: { ...configuration.env, OPENSKY_NATIVE_REPL_CONFIG: nativeConfig,
          PARITY_DESKTOP_SCOPE: JSON.stringify({ backend: "native", appSelectors: [launch.appName], isolatedDesktop: "linux", nativeFacade: true }) },
      };
      await withNativeLinuxRepl(guardedConfiguration, directory, async cell => {
        let refused = false;
        try { await cell('const { cua } = await import("@oai/cua/tinyskyAlt"); await cua.getAppState();'); }
        catch (error) {
          if (!String(error).includes('Initialize this isolated Linux interface')) throw error;
          refused = true;
        }
        if (!refused) throw new Error("Invalid native initialization was not rejected with recovery help");
        await cell('await import("@oai/cua/tinyskyAlt");');
        await cell(`var app = await cua.getApp({windowId: ${Number(owned.window)}});`);
        await verifyReady(async () => {
          const result = await cell('await app.getScreenshot();');
          const item = result.content?.find(item => item.type === "image");
          if (!item?.data) throw new Error("Current native owned-window screenshot returned no image");
          return Buffer.from(item.data, "base64");
        }, "native");
      });
    }
    if (backend === "setup") {
      await captureLinuxFinalObservation(artifacts, process.env.OPENSKY_NATIVE_PROBE_PACKAGE);
      return;
    }
    const scope = { backend: backend as "native" | "opensky", appSelectors, isolatedDesktop: "linux" as const, ...(backend === "native" ? { nativeFacade: true } : {}) };
    // The agent transport receives only the live desktop/runtime values it
    // needs; in particular, it never inherits or fabricates a CI identity.
    const runtimeEnvironment = Object.fromEntries(
      ["DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS", "OPENSKY_DISPOSABLE_DESKTOP"]
        .flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]!]]),
    );
    const mcp = {
      command: process.execPath,
      args: ["--import", join(repo, "node_modules/tsx/dist/loader.mjs"), join(root, `../${backend}-mcp.ts`)],
      env: {
        ...runtimeEnvironment,
        PARITY_DESKTOP_SCOPE: JSON.stringify(scope), OPENSKY_HOME: join(artifacts, "agent-sdk"),
        OPENSKY_DRIVER_BINARY: driver, OPENSKY_DRIVER_SOCKET: process.env.OPENSKY_DRIVER_SOCKET!,
        OPENSKY_OWNED_DRIVER_PID: process.env.OPENSKY_OWNED_DRIVER_PID!,
        OPENSKY_VERIFIED_LINUX_DRIVER: JSON.stringify(runtime.linuxIdentity),
        OPENSKY_NATIVE_REPL_CONFIG: nativeConfig,
      },
      enabled_tools: backend === "native" ? ["js"] : ["cua_repl", "cua_repl_wait"],
    };
    const prompt = matchedLinuxPrompt({ backend: backend as "native" | "opensky",
      taskInstruction: task.instruction, inputFile: task.inputFile, appName: launch.appName });
    await writeFile(join(artifacts, "matched-prompt.json"), JSON.stringify({
      version: 1, backend, prompt, sha256: createHash("sha256").update(prompt).digest("hex"),
      guidance: "Shared task and save instruction; only interface label differs. API help comes from real tool documentation.",
    }, null, 2));
    const result = await runCodex({ codex, model: "gpt-5.6-terra", authentication,
      budgetPath: process.env.OPENSKY_REMOTE_BUDGET, preReservedId: process.env.OPENSKY_REMOTE_RESERVATION,
      artifacts, cwd: join(artifacts, "agent-workspace"), timeoutMs: profile.timeoutMs, maxToolCalls: profile.maxToolCalls,
      mcp, authorizedApps: { [launch.appName]: launch.appName }, desktopProgramScope: scope,
      prompt,
    });
    await captureLinuxFinalObservation(artifacts, process.env.OPENSKY_NATIVE_PROBE_PACKAGE);
    const savedFileOutcome = JSON.parse((await exec(python, [join(root, "score.py"), taskId, document,
      ...(scoringProfilePath ? ["--profile", scoringProfilePath, "--libreoffice", "/usr/lib/libreoffice/program/soffice",
        "--expected-profile-sha256", scoringProfile.sha256!] : []),
    ], { timeout: 30_000 })).stdout);
    score = { taskId, backend, suite: "osworld-verified-linux-desktop", upstreamCommit: manifest.upstreamCommit,
      profile, scoringProfile,
      outcome: { ...savedFileOutcome, taskSuccess: savedFileOutcome.taskSuccess && !result.taskLimit }, savedFileOutcome,
      rawOutcome: savedFileOutcome.rawOutcome ?? savedFileOutcome, adaptedOutcome: savedFileOutcome.adaptedOutcome ?? null,
      infrastructureError: result.infrastructureError, taskLimit: result.taskLimit, usage: result.usage,
      toolCalls: result.toolCalls, toolCallsByName: result.toolCallsByName, admittedCalls: result.admission?.admittedCalls, contextCompactions: result.contextCompactions,
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
