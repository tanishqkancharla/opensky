import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { EvaluationBudget, estimatedUsd, type Usage } from "./budget.js";
import { DesktopProgramPolicy, nativeMethods, type DesktopProgramScope } from "./desktop-program.js";
import { classifyRun } from "./admission.js";

const exec = promisify(execFile);
type Json = Record<string, any>;
export type CodexRunOptions = {
  codex?: string;
  model: string;
  prompt: string;
  cwd: string;
  artifacts: string;
  timeoutMs: number | null;
  maxToolCalls: number | null;
  mcp: { command: string; args: string[]; env?: Record<string, string>; enabled_tools?: string[] };
  /** Exact app IDs and display names already authorized by the user for this run. */
  authorizedApps: Record<string, string>;
  /** Literal preauthorized cells for read-only transport preflights. */
  authorizedReplCodes?: string[];
  desktopProgramScope?: DesktopProgramScope;
  budgetPath?: string;
  authentication?: "chatgpt-subscription" | "api-key";
  /** Existing cumulative controller reservation; mandatory for remote API use. */
  preReservedId?: string;
};

/** Avoid inheriting the parent desktop task's tool pipe or API credentials. */
export function evaluationEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["HOME", "PATH", "TMPDIR", "LANG", "LC_ALL", "USER", "LOGNAME", "SHELL", "CODEX_HOME"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

export async function runCodex(options: CodexRunOptions) {
  if ((options.timeoutMs !== null && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)) ||
      (options.maxToolCalls !== null && (!Number.isSafeInteger(options.maxToolCalls) || options.maxToolCalls <= 0))) {
    throw new Error("Task limits must be positive or explicitly null");
  }
  const env = evaluationEnvironment();
  const authentication = options.authentication ?? "chatgpt-subscription";
  if (authentication === "api-key" && (process.env.GITHUB_ACTIONS !== "true" || !process.env.GITHUB_RUN_ID || !options.preReservedId || !options.budgetPath)) {
    throw new Error("API evaluations require a disposable CI run and an existing controller budget reservation");
  }
  if (options.model !== "gpt-5.6-terra") throw new Error("Only the user-selected Terra model has a configured evaluation rate card");
  const budget = new EvaluationBudget(options.budgetPath ?? fileURLToPath(new URL("../runs/parity-budget.json", import.meta.url)));
  await budget.initialize();
  let reservation: string | undefined;
  const programPolicy = options.desktopProgramScope && new DesktopProgramPolicy(options.desktopProgramScope);
  const admittedPrograms = new Set<string>();
  const codex = options.codex ?? join(homedir(), ".local/bin/codex");
  const login = await exec(codex, ["login", "status"], { env, timeout: 10_000 });
  const loginStatus = `${login.stdout}\n${login.stderr}`;
  if (!(authentication === "api-key" ? /Logged in using.*API key/i.test(loginStatus) : loginStatus.includes("Logged in using ChatGPT"))) {
    throw new Error(`Codex login does not match the selected ${authentication} authentication mode`);
  }
  const inventory = await exec(codex, ["mcp", "list", "--json", "-c", "features.plugins=false"], { env, timeout: 15_000, maxBuffer: 2_000_000 });
  const servers = JSON.parse(inventory.stdout) as { name: string }[];
  await mkdir(options.artifacts, { recursive: true });
  await mkdir(options.cwd, { recursive: true });
  const dispatchPolicy = join(options.artifacts, "dispatch-policy.json");
  const dispatchReceipt = join(options.artifacts, "dispatch-receipt.json");
  const guarded = !!options.desktopProgramScope;
  const mcp = { ...options.mcp, env: { ...options.mcp.env, ...(guarded ? {
    PARITY_DISPATCH_POLICY: dispatchPolicy, PARITY_DISPATCH_RECEIPT: dispatchReceipt,
  } : {}) } };
  if (guarded) await writeFile(dispatchPolicy, JSON.stringify({ armed: false, maxCalls: options.maxToolCalls, deadline: null }), { flag: "wx", mode: 0o600 });
  const configuration: Record<string, unknown> = {
    model_reasoning_effort: "medium", service_tier: "default", web_search: "disabled",
    "features.plugins": false, "features.apps": false,
    "features.browser_use": false, "features.in_app_browser": false,
    "features.shell_tool": false, "features.multi_agent": false,
    "features.computer_use": false,
  };
  const args = ["app-server"];
  for (const [key, value] of Object.entries(configuration)) args.push("-c", `${key}=${JSON.stringify(value)}`);
  for (const { name } of servers) {
    // The CLI dotted override parser treats quotes as literal key characters.
    // Reject unusual keys rather than accidentally create a second server.
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Cannot isolate MCP server name: ${name}`);
    args.push("-c", `mcp_servers.${name}.enabled=false`);
  }
  // Replace the entire server table: some desktop-injected entries have no
  // standalone transport, even when enabled=false. No user config is mutated.
  args.push("-c", `mcp_servers=${toml({ desktop: { ...mcp, enabled: true, required: true } })}`);
  const version = (await exec(codex, ["--version"], { env })).stdout.trim();
  await writeFile(join(options.artifacts, "invocation.json"), JSON.stringify({ ...options, mcp: { ...options.mcp, env: undefined, envKeys: Object.keys(options.mcp.env ?? {}) }, configuration, codexVersion: version, authentication, apiBillingEnabled: authentication === "api-key" }, null, 2));
  const events = createWriteStream(join(options.artifacts, "events.jsonl"));
  const errors = createWriteStream(join(options.artifacts, "stderr.log"));
  const child = spawn(codex, args, { cwd: options.cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  const childClosed = new Promise<void>(resolve => child.once("close", () => resolve()));
  child.stderr.pipe(errors);
  const pending = new Map<number, { resolve: (result: any) => void; reject: (error: Error) => void }>();
  let sequence = 0;
  let threadId: string | undefined;
  let turnId: string | undefined;
  let toolCalls = 0;
  let usage: unknown = null;
  let eventOrdinal = 0;
  let lastUsageEvent = -1;
  let lastItemEvent = -1;
  let finalText = "";
  let interruption: string | undefined;
  const activeCalls = new Map<string, Json>();
  const items: Json[] = [];
  const decisions: Json[] = [];
  const startedAt = new Date().toISOString();
  let taskStartedAt: string | undefined;
  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); send({ id, method, params });
  });
  let finish!: (value: Json) => void;
  let fail!: (error: Error) => void;
  const finished = new Promise<Json>((resolve, reject) => { finish = resolve; fail = reject; });
  // A timeout can happen while awaiting initialize/thread/start; don't leave an
  // unhandled rejection before the turn's completion is awaited.
  void finished.catch(() => {});
  const stop = (reason: string) => {
    interruption ??= reason;
    if (threadId && turnId) void request("turn/interrupt", { threadId, turnId }).catch(() => {});
    else fail(new Error(reason));
  };
  // Startup is bounded separately and does not consume the agent's task time.
  let timer = setTimeout(() => stop("startup_timeout"), 60_000);
  let hardTimer = setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch {} }, 70_000);
  child.on("error", fail);
  child.on("exit", (code, signal) => {
    const error = new Error(`Codex exited (${code ?? signal}) before the pending operation completed`);
    for (const item of pending.values()) item.reject(error);
    pending.clear(); fail(error);
  });
  createInterface({ input: child.stdout }).on("line", line => {
    eventOrdinal++;
    events.write(`${line}\n`);
    let message: Json;
    try { message = JSON.parse(line); } catch { stop("invalid_event_json"); return; }
    if (message.id !== undefined && !message.method) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item?.reject(new Error(JSON.stringify(message.error)));
      else item?.resolve(message.result);
      return;
    }
    const params = message.params ?? {};
    if (message.id !== undefined) {
      if (message.method === "mcpServer/elicitation/request") {
        const schema = params.requestedSchema;
        const appCall = [...activeCalls.values()].find(call => call.server === "desktop" && call.tool === "get_app_state" && options.authorizedApps[call.arguments?.app]);
        const appName = appCall && options.authorizedApps[appCall.arguments.app];
        const metadata = params._meta ?? {};
        const nativeAppName = options.authorizedApps[metadata.tool_params?.app];
        const directForm = appName && params.message === `Allow ChatGPT to use ${appName}?`;
        const nativeCall = [...activeCalls.values()].find(call => call.server === "desktop" && call.tool === "js");
        const scopedNativeAction = options.desktopProgramScope?.backend === "native" && nativeMethods.has(metadata.tool_name) && admittedPrograms.has(nativeCall?.arguments?.code);
        const replForm = nativeCall &&
          metadata.codex_approval_kind === "mcp_tool_call" && metadata.connector_id === "computer-use" &&
          (metadata.tool_name === "get_app_state" || scopedNativeAction) && metadata.riskLevel === "low" && nativeAppName &&
          params.message === `Allow Computer Use to use "${nativeAppName}"?` && Object.keys(metadata.tool_params).length === 1;
        const openskyForm = [...activeCalls.values()].some(call => call.server === "desktop" && call.tool === "cua_repl" && call.arguments?.code === metadata.tool_params?.code) &&
          metadata.codex_approval_kind === "mcp_tool_call" &&
          params.message === 'Allow the desktop MCP server to run tool "cua_repl"?' &&
          (options.authorizedReplCodes?.includes(metadata.tool_params?.code) || admittedPrograms.has(metadata.tool_params?.code));
        const allowed = !interruption && params.serverName === "desktop" && params.threadId === threadId &&
          params.mode === "form" && (directForm || replForm || openskyForm) &&
          schema?.type === "object" && Object.keys(schema.properties ?? {}).length === 0 &&
          !(schema.required?.length);
        // Use the documented one-request accept response. Do not request the
        // optional "always" persistence advertised in native service metadata.
        const response = { action: allowed ? "accept" : "decline", content: allowed ? {} : null, _meta: null };
        decisions.push({ request: params, response, basis: allowed ? "user-authorized current app-access request" : "outside preauthorized scope" });
        send({ id: message.id, result: response });
        if (!allowed) stop("unhandled_permission_request");
      } else {
        send({ id: message.id, error: { code: -32601, message: "No handler authorized for this request" } });
        stop(`unhandled_server_request:${message.method}`);
      }
      return;
    }
    if (message.method === "turn/started") turnId = params.turn.id;
    if (message.method === "thread/tokenUsage/updated") {
      usage = params.tokenUsage;
      lastUsageEvent = eventOrdinal;
      try { if (estimatedUsd(params.tokenUsage.total) >= 2.5) stop("per_run_estimate_limit"); }
      catch { stop("unusable_token_usage"); }
    }
    if (message.method === "model/rerouted") stop("model_changed_without_matching_rate_card");
    if (message.method === "item/started") {
      const item = params.item;
      if (item?.type === "mcpToolCall") {
        activeCalls.set(item.id, item); toolCalls++;
        if (programPolicy && ["js", "cua_repl"].includes(item.tool)) {
          const code = item.arguments?.code;
          if (typeof code !== "string" || !programPolicy.accepts(code)) stop("desktop_program_outside_fixture_scope");
          else admittedPrograms.add(code);
        }
        if (item.server !== "desktop") stop("unexpected_tool_server");
        // Scored arms enforce admission inside the transport. Wait for its
        // denial receipt so cancellation cannot race an extra desktop action.
        if (!guarded && options.maxToolCalls !== null && toolCalls > options.maxToolCalls) stop("tool_call_budget_exceeded");
      } else if (["commandExecution", "fileChange", "webSearch", "collabToolCall", "dynamicToolCall"].includes(item?.type)) stop(`unexpected_tool:${item.type}`);
    }
    if (message.method === "item/completed") {
      lastItemEvent = eventOrdinal;
      items.push(params.item); activeCalls.delete(params.item.id);
      if (params.item.type === "mcpToolCall" && (params.item.status === "failed" || params.item.result?.isError || params.item.error)) programPolicy?.executionFailed();
      if (params.item.type === "agentMessage") finalText = params.item.text;
      const limit = params.item.result?.structuredContent?.parityTaskLimit;
      if (params.item.type === "mcpToolCall" && ["tool_call_budget_exceeded", "run_timeout"].includes(limit)) stop(limit);
    }
    if (message.method === "turn/completed") finish(params.turn);
  });
  try {
    await request("initialize", { clientInfo: { name: "opensky_parity", title: "OpenSky parity evaluation", version: "0.1" }, capabilities: { experimentalApi: true } });
    send({ method: "initialized", params: {} });
    const started = await request("thread/start", {
      model: options.model, cwd: options.cwd, ephemeral: true, approvalPolicy: "on-request", sandbox: "read-only",
      config: { ...configuration, ...Object.fromEntries(servers.map(({name}) => [`mcp_servers.${name}.enabled`, false])), "mcp_servers.desktop": { ...mcp, enabled: true, required: true } },
      developerInstructions: `Operate only through the desktop MCP server. ${options.maxToolCalls === null ? "There is no desktop tool-call cap." : `You have at most ${options.maxToolCalls} desktop tool calls.`} ${options.timeoutMs === null ? "There is no whole-task deadline. Continue until the task is complete and saved, or report a concrete blocker. Context compaction is managed by Codex." : `A watchdog stops this run after ${options.timeoutMs / 1000} seconds; complete and save the task before then.`} Do not use shell, document filesystem access, web search, other connectors, or other computer control tools. The native backend's documented screenshot recipe may read only a screenshot URL returned by get_app_state. Stop if the assigned interface cannot complete the task. Never inspect evaluation code or expected answers.`,
    });
    threadId = started.thread.id;
    if (options.preReservedId) {
      await budget.claim(options.preReservedId, process.env.GITHUB_RUN_ID ?? options.artifacts);
      reservation = options.preReservedId;
    } else reservation = await budget.reserve(options.artifacts, 5);
    clearTimeout(timer); clearTimeout(hardTimer);
    taskStartedAt = new Date().toISOString();
    if (guarded) await writeFile(dispatchPolicy, JSON.stringify({ armed: true, maxCalls: options.maxToolCalls, deadline: options.timeoutMs === null ? null : Date.now() + options.timeoutMs }));
    if (options.timeoutMs !== null) {
      timer = setTimeout(() => stop("run_timeout"), options.timeoutMs);
      hardTimer = setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch {} }, options.timeoutMs + 10_000);
    }
    await request("turn/start", { threadId, input: [{ type: "text", text: options.prompt }], effort: "medium" });
    const turn = await finished;
    const admission = guarded ? await readFile(dispatchReceipt, "utf8").then(JSON.parse).catch(() => null) : null;
    interruption ??= admission?.deniedReason ?? undefined;
    const classification = classifyRun(interruption, turn.status, admission, options.maxToolCalls);
    if (guarded && !admission) classification.infrastructureError = "missing_dispatch_receipt";
    const contextCompactions = items.filter(item => item.type === "contextCompaction").length;
    const result = { startedAt: taskStartedAt ?? startedAt, runnerStartedAt: startedAt, finishedAt: new Date().toISOString(), threadId, turn, interruption, ...classification, admission, usage, toolCalls, contextCompactions, items, finalText, decisions, authentication, workspaceBillUsd: null };
    await writeFile(join(options.artifacts, "result.json"), JSON.stringify(result, null, 2));
    const finalInterruptedUsage = classification.taskLimit && turn.status === "interrupted" && activeCalls.size === 0 && lastUsageEvent > lastItemEvent;
    if (((turn.status === "completed" && !interruption) || finalInterruptedUsage) && usage) {
      await budget.settle(reservation, (usage as { total: Usage }).total, finalInterruptedUsage
        ? "Interrupted task limit: terminal turn, no active tool calls, usage received after final completed item. Conservative API-equivalent estimate; workspace bill unavailable"
        : "Conservative long-context standard API-equivalent estimate; workspace bill unavailable");
    }
    return result;
  } catch (error) {
    await writeFile(join(options.artifacts, "failure.json"), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), threadId, usage, toolCalls, decisions, error: error instanceof Error ? error.message : String(error) }, null, 2));
    throw error;
  } finally {
    clearTimeout(timer); clearTimeout(hardTimer);
    // Let MCP children finish their normal shutdown before fallback signals.
    // Native app cleanup is a separate, independently verified fixture step.
    child.stdin.end();
    const terminate = setTimeout(() => { try { process.kill(-child.pid!, "SIGTERM"); } catch {} }, 2_000);
    const kill = setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch {} }, 4_000);
    await childClosed;
    clearTimeout(terminate); clearTimeout(kill);
    events.end();
  }
}

function toml(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(toml).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`).join(",")}}`;
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  throw new Error("Unsupported TOML configuration value");
}
