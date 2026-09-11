import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  convertToLlm,
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  serializeConversation,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

import {
  getEvalArtifactPaths,
  recordAgentEvent,
  recordJudgeEvent,
  recordTranscriptMarkdown,
} from "./artifacts.js";
import type { EvalHarness, EvalHarnessName, EvalResponse, EvalScore } from "./eval-case.js";
import { RecordingDriverClient } from "./driver-tape.js";
import { FleetMcpDriver } from "./mcp-driver.js";
import {
  createCuaReplToolRuntime,
  CUA_DRIVER_TOOL_NAMES,
  CUA_REPL_TOOL_NAMES,
  cuaDriverTools,
} from "./tools.js";
import type { EvalVm } from "./vm.js";
import { CuaDriverClient } from "../src/driver.js";
import { detectTarget } from "../src/platform.js";

export type ModelSelector = `${string}/${string}`;

const DEFAULT_MODEL: ModelSelector = "openai/gpt-5.6-terra";
const DEFAULT_SESSION_TIMEOUT_MS = 180_000;
const SESSION_TEARDOWN_TIMEOUT_MS = 10_000;

export type PiHarnessOptions = {
  cwd: string;
  model?: ModelSelector;
  harness: EvalHarnessName;
  vm?: EvalVm;
  timeoutMs?: number;
};

export class ComputerUseHarness implements EvalHarness {
  readonly name: EvalHarnessName;
  private readonly cwd: string;
  private readonly model: ModelSelector;
  private readonly vm?: EvalVm;
  private readonly timeoutMs: number;

  constructor(options: PiHarnessOptions) {
    this.name = options.harness;
    this.cwd = options.cwd;
    this.model = options.model ?? DEFAULT_MODEL;
    this.vm = options.vm;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
  }

  async send(prompt: string): Promise<EvalResponse> {
    if (this.name === "codex") {
      return this.sendCodex(prompt);
    }
    return this.sendPi(prompt);
  }

  private async sendPi(prompt: string): Promise<EvalResponse> {
    const local = !this.vm;
    const privateHome = await mkdtemp(join(tmpdir(), "opensky-eval-home-"));
    let driver: RecordingDriverClient | undefined;
    let openskyRuntime: ReturnType<typeof createCuaReplToolRuntime> | undefined;
    let result: Awaited<ReturnType<typeof runPiSession>> | undefined;
    let runError: unknown;
    let cleanupError: unknown;
    let runtimeCleanupSucceeded = false;
    try {
      const baseDriver = local ? localDriver() : new FleetMcpDriver(this.vm!);
      driver = new RecordingDriverClient(baseDriver, {
        backend: local ? "local-real-driver" : "fleet",
        target: local ? detectTarget() : this.vm!.os,
      });
      openskyRuntime = this.name === "opensky"
        ? createCuaReplToolRuntime(driver, local ? detectTarget() : this.vm!.os, { homeDir: privateHome })
        : undefined;
      const customTools = openskyRuntime?.tools ?? cuaDriverTools(driver);
      const toolNames = this.name === "opensky" ? [...CUA_REPL_TOOL_NAMES] : [...CUA_DRIVER_TOOL_NAMES];
      result = await runPiSession({
        cwd: this.cwd,
        model: this.model,
        prompt,
        source: "agent",
        systemPrompt: agentSystemPrompt(this.name),
        noTools: "builtin",
        tools: toolNames,
        customTools,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      runError = error;
    } finally {
      if (result) {
        const { startedAt, finishedAt, transcript } = result;
        recordTranscriptMarkdown({
          source: "agent",
          prompt,
          transcript: transcript || "(empty agent output)",
          startedAt,
          finishedAt,
        });
      }
      try {
        await bounded(openskyRuntime?.close(), SESSION_TEARDOWN_TIMEOUT_MS, "OpenSky cleanup");
        runtimeCleanupSucceeded = true;
      } catch (error) {
        cleanupError = error;
        recordAgentEvent({
          type: "opensky_cleanup_error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      let privateHomeStatus: { status: "removed" } | { status: "retained"; path: string } = {
        status: "retained",
        path: privateHome,
      };
      if (runtimeCleanupSucceeded) {
        try {
          await rm(privateHome, { recursive: true, force: true });
          privateHomeStatus = { status: "removed" };
        } catch (error) {
          cleanupError = cleanupError
            ? new AggregateError([cleanupError, error], "OpenSky cleanup and private-home removal failed")
            : error;
        }
      }
      try {
        const paths = getEvalArtifactPaths();
        if (paths) {
          const caseDir = dirnameOf(paths.transcript);
          if (driver) {
            await writeFile(join(caseDir, "driver-tape.json"), `${JSON.stringify(driver.tape, null, 2)}\n`);
          }
          await writeFile(join(caseDir, "cleanup.json"), `${JSON.stringify({
            finishedAt: new Date().toISOString(),
            backend: local ? "local-real-driver" : "fleet",
            target: local ? detectTarget() : this.vm!.os,
            runtimeClose: openskyRuntime
              ? runtimeCleanupSucceeded
                ? { status: "completed" }
                : { status: "failed", error: errorMessage(cleanupError) }
              : { status: "not-applicable" },
            privateHome: privateHomeStatus,
          }, null, 2)}\n`);
        }
      } catch (error) {
        cleanupError = cleanupError
          ? new AggregateError([cleanupError, error], "OpenSky cleanup and driver-tape recording failed")
          : error;
      }
    }
    if (runError && cleanupError) {
      throw new AggregateError([runError, cleanupError], "Pi session and OpenSky cleanup both failed");
    }
    if (runError) throw runError;
    if (cleanupError) throw cleanupError;
    if (!result) throw new Error("Pi session returned no result");
    const { sessionId, startedAt, finishedAt, transcript } = result;

    return this.response({
      prompt,
      transcript,
      sessionId,
      startedAt,
      finishedAt,
    });
  }

  private async sendCodex(prompt: string): Promise<EvalResponse> {
    if (!this.vm) {
      throw new Error(
        "The local Codex harness is disabled: provision and select the native Computer Use plugin explicitly before claiming parity.",
      );
    }
    const startedAt = new Date().toISOString();
    const quoted = JSON.stringify(prompt);
    const modelId = this.model.includes("/") ? this.model.slice(this.model.indexOf("/") + 1) : this.model;
    const command = [
      "codex",
      "exec",
      "--model",
      modelId,
      "--skip-git-repo-check",
      quoted,
    ].join(" ");
    const result = await this.vm.shell(command);
    const transcript = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const finishedAt = new Date().toISOString();
    recordAgentEvent({
      type: "codex_exec",
      command,
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    recordTranscriptMarkdown({
      source: "agent",
      prompt,
      transcript: transcript || "(empty Codex output)",
      startedAt,
      finishedAt,
    });
    if (!result.success && !transcript) {
      throw new Error(
        `codex exec failed on the Fleet VM. Install Codex CLI + Computer Use on the macOS image. ${result.stderr}`,
      );
    }
    return this.response({
      prompt,
      transcript: transcript || result.stderr,
      sessionId: `codex:${this.vm.name}`,
      startedAt,
      finishedAt,
    });
  }

  private response(opts: {
    prompt: string;
    transcript: string;
    sessionId: string;
    startedAt: string;
    finishedAt: string;
  }): EvalResponse {
    return {
      prompt: opts.prompt,
      transcript: opts.transcript,
      sessionId: opts.sessionId,
      score: (criteria) =>
        scoreTranscript({
          criteria,
          cwd: this.cwd,
          model: this.model,
          agent: {
            prompt: opts.prompt,
            model: this.model,
            sessionId: opts.sessionId,
          },
          timeoutMs: this.timeoutMs,
        }),
    };
  }
}

function agentSystemPrompt(harness: EvalHarnessName): string {
  if (harness === "opensky") {
    return [
      "You operate a desktop through the cua_repl tool only.",
      "Do not use bash, osascript, cliclick, or any other computer-control path.",
      "Use the preloaded cua facade and keep bindings across calls.",
      "Call cua.getApp(name) directly for a named native app or cua.createBrowserTab(browser, url) for a new exact owned browser tab.",
      "Use getAXState after actions when you need fresh evidence; action methods do not observe automatically.",
      "Interact only with applications named or required by the task.",
    ].join(" ");
  }
  return [
    "You operate a remote desktop through cua_driver_call only, matching `cua-driver call --raw TOOL JSON`.",
    "Do not use bash, osascript, or cliclick.",
    "Typical loop: launch_app or list_apps → list_windows → get_window_state → click/type with pid and window_id → get_window_state again.",
    "Discover installed applications with list_apps and use their returned launch_path. Do not assume an application is installed.",
  ].join(" ");
}

export async function scoreTranscript(opts: {
  criteria: string[];
  cwd: string;
  model: ModelSelector;
  agent: { prompt: string; model: string; sessionId: string };
  timeoutMs?: number;
}): Promise<EvalScore> {
  const criteria = opts.criteria.map((item) => item.trim()).filter(Boolean);
  if (criteria.length === 0) {
    throw new Error("score() requires at least one non-empty criterion.");
  }
  const paths = getEvalArtifactPaths();
  if (!paths) throw new Error("score() requires eval artifact paths.");
  const caseDir = dirnameOf(paths.transcript);

  const prompt = [
    "Score whether the eval run artifacts satisfy each criterion in CRITERIA.",
    "Use the read and bash tools to inspect files in CASE_DIR.",
    "Prioritize CASE_DIR/transcript.jsonl, the raw agent event stream with full tool call arguments.",
    "Use jq with bash to query transcript.jsonl when you need structured evidence.",
    "Use CASE_DIR/transcript.md as a human-readable secondary view.",
    "Return only JSON with key `criteria` where each item is:",
    "{ criterion, pass, reason }",
    "Use the exact criterion text; do not rewrite criterion names.",
    "Be strict and mark pass=false when evidence is missing from the artifacts.",
    "Efficiency criteria fail if the agent listed apps repeatedly, targeted the wrong app, or took a long retry loop when a short snapshot-act-snapshot path would do.",
    "",
    `CASE_DIR:\n${caseDir}`,
    "",
    `CRITERIA:\n${JSON.stringify(criteria, null, 2)}`,
  ].join("\n");

  const { sessionId, startedAt, finishedAt, transcript } = await runPiSession({
    cwd: opts.cwd,
    model: opts.model,
    prompt,
    source: "judge",
    systemPrompt:
      "You are an eval judge. Inspect CASE_DIR artifacts with read/bash. Reply with JSON only.",
    tools: ["read", "bash"],
    customTools: [],
    timeoutMs: opts.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
  });

  recordTranscriptMarkdown({
    source: "judge",
    prompt,
    transcript,
    startedAt,
    finishedAt,
  });

  const parsed = parseCriteria(transcript, criteria);
  const passed = parsed.filter((item) => item.pass).length;
  return {
    criteria: parsed,
    passed,
    total: parsed.length,
    percent: Math.round((passed / parsed.length) * 100),
    agent: opts.agent,
    judge: {
      prompt,
      model: opts.model,
      result: transcript,
    },
  };
}

async function runPiSession(opts: {
  cwd: string;
  model: ModelSelector;
  prompt: string;
  source: "agent" | "judge";
  systemPrompt: string;
  noTools?: "all" | "builtin";
  tools?: string[];
  customTools: Parameters<typeof createAgentSession>[0] extends { customTools?: infer T } ? NonNullable<T> : never;
  timeoutMs: number;
}): Promise<{
  sessionId: string;
  events: AgentSessionEvent[];
  startedAt: string;
  finishedAt: string;
  transcript: string;
}> {
  await mkdir(join(opts.cwd, ".pi"), { recursive: true });
  const modelRuntime = await ModelRuntime.create();
  const model = resolveModel(modelRuntime, opts.model);
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: join(opts.cwd, ".pi"),
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: opts.systemPrompt,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: opts.cwd,
    agentDir: join(opts.cwd, ".pi"),
    model,
    thinkingLevel: "medium",
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(),
    noTools: opts.noTools,
    tools: opts.tools,
    customTools: opts.customTools,
  });

  const events: AgentSessionEvent[] = [];
  const unsubscribe = session.subscribe((event) => {
    events.push(event);
    if (opts.source === "agent") recordAgentEvent(event);
    else recordJudgeEvent(event);
  });
  const startedAt = new Date().toISOString();
  let promptSettled = false;
  const promptPromise = session.prompt(opts.prompt).finally(() => {
    promptSettled = true;
  });
  let runError: unknown;
  let teardownError: unknown;
  try {
    await abortOnTimeout(promptPromise, opts.timeoutMs, `${opts.source} session`);
  } catch (error) {
    runError = error;
  } finally {
    if (!promptSettled) {
      try {
        await bounded(session.abort(), SESSION_TEARDOWN_TIMEOUT_MS, `${opts.source} session abort`);
        await bounded(
          promptPromise.catch(() => undefined),
          SESSION_TEARDOWN_TIMEOUT_MS,
          `${opts.source} prompt settlement`,
        );
      } catch (error) {
        teardownError = error;
        const event = { type: "pi_session_teardown_error", error: errorMessage(error) };
        if (opts.source === "agent") recordAgentEvent(event);
        else recordJudgeEvent(event);
      }
    }
    session.dispose();
    unsubscribe();
  }
  if (runError && teardownError) {
    throw new AggregateError([runError, teardownError], `${opts.source} session and teardown both failed`);
  }
  if (runError) throw runError;
  if (teardownError) throw teardownError;
  const finishedAt = new Date().toISOString();
  const transcript = formatMessages(session.messages);
  const sessionId = session.sessionId;
  return { sessionId, events, startedAt, finishedAt, transcript };
}

function localDriver(): CuaDriverClient {
  return new CuaDriverClient({
    binaryPath: (process.env.OPENSKY_DRIVER_BINARY ?? process.env.CUA_DRIVER_BINARY)?.trim() || undefined,
    socket: (process.env.OPENSKY_DRIVER_SOCKET ?? process.env.CUA_DRIVER_SOCKET)?.trim() || undefined,
    autoInstall: false,
    autoStart: false,
  });
}

async function abortOnTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "unknown cleanup failure");
}

async function bounded<T>(operation: Promise<T> | undefined, timeoutMs: number, label: string): Promise<T | undefined> {
  if (!operation) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveModel(modelRuntime: ModelRuntime, selector: ModelSelector) {
  const slash = selector.indexOf("/");
  if (slash <= 0) throw new Error(`Invalid model "${selector}". Expected provider/model.`);
  const provider = selector.slice(0, slash);
  const id = selector.slice(slash + 1);
  const model = modelRuntime.getModel(provider, id);
  if (!model) {
    throw new Error(`Unknown Pi model: ${selector}`);
  }
  return model;
}

function formatMessages(messages: unknown): string {
  try {
    return serializeConversation(convertToLlm(messages as never)).trim();
  } catch {
    return JSON.stringify(messages, null, 2);
  }
}

function parseCriteria(
  transcript: string,
  expected: string[],
): Array<{ criterion: string; pass: boolean; reason: string }> {
  const parsed = extractCriteriaPayload(transcript);
  if (parsed === null) {
    return expected.map((criterion) => ({
      criterion,
      pass: false,
      reason: "Judge did not return JSON.",
    }));
  }
  const items =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { criteria?: unknown }).criteria)
      ? ((parsed as { criteria: unknown[] }).criteria)
      : [];
  const byCriterion = new Map<string, { criterion: string; pass: boolean; reason: string }>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as { criterion?: unknown; pass?: unknown; reason?: unknown };
    if (typeof record.criterion !== "string") continue;
    byCriterion.set(record.criterion, {
      criterion: record.criterion,
      pass: record.pass === true,
      reason: typeof record.reason === "string" && record.reason.trim() ? record.reason : "No reason.",
    });
  }
  return expected.map((criterion) => {
    const matched = byCriterion.get(criterion);
    return (
      matched ?? {
        criterion,
        pass: false,
        reason: "No score returned for this criterion.",
      }
    );
  });
}

function extractCriteriaPayload(transcript: string): unknown | null {
  const marker = "\n[Assistant]:";
  const lastAssistant = transcript.lastIndexOf(marker);
  const chunk = lastAssistant >= 0 ? transcript.slice(lastAssistant + marker.length) : transcript;
  const candidates = [chunk, transcript];
  for (const text of candidates) {
    const parsed = firstJsonObject(text);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { criteria?: unknown }).criteria)) {
      return parsed;
    }
  }
  return null;
}

function firstJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function dirnameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : path;
}
