import { mkdir } from "node:fs/promises";
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
import { FleetMcpDriver } from "./mcp-driver.js";
import { CUA_DRIVER_TOOL_NAMES, cuaDriverTools, OPENSKY_TOOL_NAMES, openskyTools } from "./tools.js";
import type { EvalVm } from "./vm.js";

export type ModelSelector = `${string}/${string}`;

const DEFAULT_MODEL: ModelSelector = "openai/gpt-5.6-sol";

export type PiHarnessOptions = {
  cwd: string;
  model: ModelSelector;
  harness: EvalHarnessName;
  vm: EvalVm;
};

export class ComputerUseHarness implements EvalHarness {
  readonly name: EvalHarnessName;
  private readonly cwd: string;
  private readonly model: ModelSelector;
  private readonly vm: EvalVm;

  constructor(options: PiHarnessOptions) {
    this.name = options.harness;
    this.cwd = options.cwd;
    this.model = options.model;
    this.vm = options.vm;
  }

  async send(prompt: string): Promise<EvalResponse> {
    if (this.name === "codex") {
      return this.sendCodex(prompt);
    }
    return this.sendPi(prompt);
  }

  private async sendPi(prompt: string): Promise<EvalResponse> {
    const driver = new FleetMcpDriver(this.vm);
    const customTools =
      this.name === "opensky" ? openskyTools(driver, this.vm.os) : cuaDriverTools(driver);
    const toolNames = this.name === "opensky" ? [...OPENSKY_TOOL_NAMES] : [...CUA_DRIVER_TOOL_NAMES];
    const { sessionId, startedAt, finishedAt, transcript } = await runPiSession({
      cwd: this.cwd,
      model: this.model,
      prompt,
      source: "agent",
      systemPrompt: agentSystemPrompt(this.name),
      noTools: "builtin",
      tools: toolNames,
      customTools,
    });
    recordTranscriptMarkdown({
      source: "agent",
      prompt,
      transcript: transcript || "(empty agent output)",
      startedAt,
      finishedAt,
    });

    return this.response({
      prompt,
      transcript,
      sessionId,
      startedAt,
      finishedAt,
    });
  }

  private async sendCodex(prompt: string): Promise<EvalResponse> {
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
        }),
    };
  }
}

function agentSystemPrompt(harness: EvalHarnessName): string {
  if (harness === "opensky") {
    return [
      "You operate a remote desktop through the opensky tools only.",
      "Do not use bash, osascript, cliclick, or any other computer-control path.",
      "Canonical loop: get_app_state({ app, disableDiff: true }) → act with element_index → get_app_state again.",
      "Prefer display names. Refresh state after every action.",
    ].join(" ");
  }
  return [
    "You operate a remote desktop through cua_driver_call only, matching `cua-driver call --raw TOOL JSON`.",
    "Do not use bash, osascript, or cliclick.",
    "Typical loop: launch_app or list_apps → list_windows → get_window_state → click/type with pid and window_id → get_window_state again.",
  ].join(" ");
}

export async function scoreTranscript(opts: {
  criteria: string[];
  cwd: string;
  model: ModelSelector;
  agent: { prompt: string; model: string; sessionId: string };
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
  try {
    await session.prompt(opts.prompt);
  } finally {
    unsubscribe();
  }
  const finishedAt = new Date().toISOString();
  const transcript = formatMessages(session.messages);
  const sessionId = session.sessionId;
  session.dispose();
  return { sessionId, events, startedAt, finishedAt, transcript };
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
