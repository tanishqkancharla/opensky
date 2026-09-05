import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  CuaDriverClient,
  type CuaDriverOptions,
  asRecord,
  isPreDispatchSessionEnded,
  parseDriverOutput,
  parseDriverRefusal,
} from "./driver.js";
import { OpenSkyError, driverError } from "./errors.js";
import { detectTarget } from "./platform.js";
import type { DriverClient, DriverResult, OpenSkyTarget } from "./types.js";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2024-11-05", MCP_PROTOCOL_VERSION]);
const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 3_000;
const DEFAULT_KILL_TIMEOUT_MS = 2_000;
const DEFAULT_MAX_LINE_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 16 * 1024;
const DEFAULT_MAX_PENDING_CALLS = 64;

export interface StdioMcpDriverOptions extends CuaDriverOptions {
  /** Explicit platform seam for topology tests. Defaults to the current host. */
  target?: OpenSkyTarget;
  maxLineBytes?: number;
  maxStderrBytes?: number;
  maxPendingCalls?: number;
  handshakeTimeoutMs?: number;
  drainTimeoutMs?: number;
  closeTimeoutMs?: number;
  killTimeoutMs?: number;
}

export interface McpProxySessionOwnership {
  kind: "mcp-proxy";
  instanceId: string;
}

export interface TransportCloseReceipt {
  kind: "mcp-stdio";
  instanceId: string;
  admissionClosed: true;
  callsDrained: boolean;
  stdinClosed: boolean;
  exited: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  forced: boolean;
  verified: boolean;
  stderrTail: string;
}

interface PendingResponse {
  id: number;
  method: string;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timer: NodeJS.Timeout;
}

interface ExitState {
  code: number | null;
  signal: NodeJS.Signals | null;
}

/**
 * Opt-in persistent MCP transport. This client owns one stdio proxy and its
 * transport namespace; it never owns an injected/shared OpenSky consumer.
 */
export class StdioMcpDriverClient implements DriverClient {
  readonly sessionOwnership: McpProxySessionOwnership;

  private readonly helper: CuaDriverClient;
  private readonly target: OpenSkyTarget;
  private readonly socket?: string;
  private readonly session?: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly maxLineBytes: number;
  private readonly maxStderrBytes: number;
  private readonly maxPendingCalls: number;
  private readonly callTimeoutMs: number;
  private readonly handshakeTimeoutMs: number;
  private readonly drainTimeoutMs: number;
  private readonly closeTimeoutMs: number;
  private readonly killTimeoutMs: number;
  private child?: ChildProcessWithoutNullStreams;
  private stdoutBuffer = Buffer.alloc(0);
  private stderrTail = Buffer.alloc(0);
  private toolNames?: ReadonlySet<string>;
  private pending?: PendingResponse;
  private nextId = 1;
  private ready = false;
  private accepting = true;
  private quarantined = false;
  private quarantineMessage?: string;
  private forced = false;
  private exitState?: ExitState;
  private exitWaiters: Array<(state: ExitState) => void> = [];
  private admitted = new Set<Promise<unknown>>();
  private serial: Promise<void> = Promise.resolve();
  private closePromise?: Promise<TransportCloseReceipt>;
  private quarantineExit?: Promise<void>;

  constructor(options: StdioMcpDriverOptions = {}) {
    this.env = { ...(options.env ?? process.env) };
    this.target = exactTarget(options.target ?? detectTarget());
    this.socket = explicitSocket(options.socket ?? this.env.CUA_DRIVER_SOCKET);
    this.session = optionalNonemptyString(options.session, "session");
    this.helper = new CuaDriverClient({ ...options, env: this.env, session: this.session, socket: this.socket });
    this.maxLineBytes = positiveInteger(options.maxLineBytes, DEFAULT_MAX_LINE_BYTES, "maxLineBytes");
    this.maxStderrBytes = positiveInteger(options.maxStderrBytes, DEFAULT_MAX_STDERR_BYTES, "maxStderrBytes");
    this.maxPendingCalls = positiveInteger(options.maxPendingCalls, DEFAULT_MAX_PENDING_CALLS, "maxPendingCalls");
    this.callTimeoutMs = positiveInteger(options.timeoutMs, DEFAULT_CALL_TIMEOUT_MS, "timeoutMs");
    this.handshakeTimeoutMs = positiveInteger(options.handshakeTimeoutMs, DEFAULT_HANDSHAKE_TIMEOUT_MS, "handshakeTimeoutMs");
    this.closeTimeoutMs = positiveInteger(options.closeTimeoutMs, DEFAULT_CLOSE_TIMEOUT_MS, "closeTimeoutMs");
    this.drainTimeoutMs = positiveInteger(options.drainTimeoutMs, this.closeTimeoutMs, "drainTimeoutMs");
    this.killTimeoutMs = positiveInteger(options.killTimeoutMs, DEFAULT_KILL_TIMEOUT_MS, "killTimeoutMs");
    if (options.startTimeoutMs !== undefined) positiveInteger(options.startTimeoutMs, options.startTimeoutMs, "startTimeoutMs");
    this.sessionOwnership = Object.freeze({ kind: "mcp-proxy", instanceId: randomUUID() });
  }

  status(): Promise<{ running: boolean; text: string }> {
    return this.enqueue(() => this.helper.status());
  }

  ensureDaemon(): Promise<void> {
    return this.enqueue(() => this.helper.ensureDaemon());
  }

  call(tool: string, args: Record<string, unknown> = {}): Promise<DriverResult> {
    const admissionError = this.admissionError();
    if (admissionError) return Promise.reject(admissionError);
    if (this.admitted.size >= this.maxPendingCalls) {
      return Promise.reject(driverError(
        `persistent MCP transport already has ${this.maxPendingCalls} admitted operation(s)`,
        "mcp_pending_limit",
      ));
    }
    if (typeof tool !== "string" || tool.length === 0) {
      return Promise.reject(driverError("MCP tool name must be a non-empty string", "mcp_invalid_arguments"));
    }
    if (Buffer.byteLength(tool) > this.maxLineBytes) {
      return Promise.reject(driverError(`MCP tool name must serialize within ${this.maxLineBytes} bytes`, "mcp_request_too_large"));
    }
    let snapshot: Record<string, unknown>;
    try {
      snapshot = snapshotArgs(args, this.maxLineBytes);
    } catch (error) {
      return Promise.reject(error);
    }
    return this.enqueueAccepted(() => this.callSerialized(tool, snapshot));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const admissionError = this.admissionError();
    if (admissionError) return Promise.reject(admissionError);
    if (this.admitted.size >= this.maxPendingCalls) {
      return Promise.reject(driverError(
        `persistent MCP transport already has ${this.maxPendingCalls} admitted operation(s)`,
        "mcp_pending_limit",
      ));
    }
    return this.enqueueAccepted(operation);
  }

  private enqueueAccepted<T>(operation: () => Promise<T>): Promise<T> {
    const work = this.serial.then(() => {
      if (this.quarantined) throw driverError(this.closedMessage(), "mcp_transport_quarantined");
      if (!this.accepting) throw driverError("persistent MCP transport is closing or closed", "mcp_transport_closed");
      return operation();
    });
    this.serial = work.then(() => undefined, () => undefined);
    this.admitted.add(work);
    void work.finally(() => this.admitted.delete(work)).catch(() => undefined);
    return work;
  }

  private admissionError(): OpenSkyError | undefined {
    if (this.quarantined) return driverError(this.closedMessage(), "mcp_transport_quarantined");
    if (!this.accepting) return driverError(this.closedMessage(), "mcp_transport_closed");
    return undefined;
  }

  closeTransport(): Promise<TransportCloseReceipt> {
    if (this.closePromise) return this.closePromise;
    // Admission closes synchronously, before the first await in finalization.
    this.accepting = false;
    this.closePromise = this.finishClose();
    return this.closePromise;
  }

  private async callSerialized(tool: string, args: Record<string, unknown>): Promise<DriverResult> {
    // Calls queued behind an active operation have not been dispatched and are
    // cancelled when close synchronously stops admission.
    await this.ensureTransport();

    const payload = { ...args };
    if (this.session && payload.session === undefined) payload.session = this.session;

    let parsed = await this.callTool(tool, payload);
    if (this.canReviveExactSession(tool, payload, parsed)) {
      const revival = await this.callTool("start_session", { session: this.session });
      this.requireToolSuccess("start_session", revival);
      parsed = await this.callTool(tool, payload);
    }
    return this.requireToolSuccess(tool, parsed);
  }

  private async ensureTransport(): Promise<void> {
    if (this.ready) return;
    if (this.child || this.quarantined) throw driverError(this.closedMessage(), "mcp_transport_quarantined");

    const args = this.transportArgs();
    await this.helper.ensureDaemon();
    if (!this.accepting || this.quarantined) {
      throw driverError(this.closedMessage(), this.quarantined ? "mcp_transport_quarantined" : "mcp_transport_closed");
    }
    const binary = await this.helper.resolveBinary();
    if (!binary) throw driverError("opensky desktop helper disappeared after readiness validation", "mcp_binary_unavailable");
    if (!this.accepting || this.quarantined) {
      throw driverError(this.closedMessage(), this.quarantined ? "mcp_transport_quarantined" : "mcp_transport_closed");
    }
    const child = spawn(binary, args, {
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    this.attachChild(child);

    try {
      const initialized = asRecord(await this.request("initialize", {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "opensky", version: "0.1.2" },
      }, this.handshakeTimeoutMs));
      const capabilities = asRecord(initialized?.capabilities);
      if (!initialized || typeof initialized.protocolVersion !== "string" ||
          !SUPPORTED_PROTOCOL_VERSIONS.has(initialized.protocolVersion) ||
          !capabilities || !asRecord(capabilities.tools) ||
          asRecord(initialized.serverInfo)?.name !== "cua-driver") {
        throw driverError("desktop helper returned a malformed MCP initialize result", "mcp_protocol_error");
      }
      await this.notification("notifications/initialized", {});
      const listed = asRecord(await this.request(
        "tools/list",
        {},
        this.handshakeTimeoutMs,
      ));
      const tools = listed?.tools;
      if (!Array.isArray(tools) || tools.length === 0 || tools.some((entry) => {
        const tool = asRecord(entry);
        return !tool || typeof tool.name !== "string" || tool.name.length === 0;
      })) {
        throw driverError("desktop helper returned a malformed MCP tools/list result", "mcp_protocol_error");
      }
      this.toolNames = new Set(tools.map((entry) => String(asRecord(entry)?.name)));
      this.ready = true;
    } catch (error) {
      this.quarantine("MCP handshake failed", error);
      throw error;
    }
  }

  private transportArgs(): string[] {
    if (this.target !== "mac" && !this.socket) {
      throw driverError(
        "Persistent MCP on Windows/Linux requires an explicit daemon socket or named pipe in options.socket or CUA_DRIVER_SOCKET; refusing bare direct-runtime MCP.",
        "mcp_socket_required",
      );
    }
    return this.socket ? ["--socket", this.socket, "mcp"] : ["mcp"];
  }

  private attachChild(child: ChildProcessWithoutNullStreams): void {
    child.stdout.on("data", (chunk: Buffer) => this.consumeStdout(chunk));
    child.stdout.on("end", () => {
      if (this.stdoutBuffer.length > 0) this.quarantine("MCP stdout ended with an incomplete frame");
      else if (this.pending || this.accepting) this.quarantine("MCP stdout ended unexpectedly");
    });
    child.stdout.on("error", (error) => this.quarantine("MCP stdout failed", error));
    child.stderr.on("data", (chunk: Buffer) => this.retainStderr(chunk));
    child.stderr.on("error", (error) => this.quarantine("MCP stderr failed", error));
    child.stdin.on("error", (error) => this.quarantine("MCP stdin failed", error));
    child.on("error", (error) => this.quarantine("MCP child process error", error));
    child.on("close", (code, signal) => {
      this.exitState = { code, signal };
      for (const resolve of this.exitWaiters.splice(0)) resolve(this.exitState);
      if (this.pending || this.accepting) this.quarantine("MCP child exited unexpectedly");
    });
  }

  private consumeStdout(chunk: Buffer): void {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(0x0a, offset);
      const end = newline < 0 ? chunk.length : newline;
      const segment = chunk.subarray(offset, end);
      if (this.stdoutBuffer.length + segment.length > this.maxLineBytes) {
        this.quarantine(`MCP response exceeded ${this.maxLineBytes} bytes`);
        return;
      }
      if (segment.length) this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, segment]);
      if (newline < 0) return;
      const line = this.stdoutBuffer;
      this.stdoutBuffer = Buffer.alloc(0);
      if (line.length > 0) this.consumeLine(line);
      if (this.quarantined) return;
      offset = newline + 1;
    }
  }

  private consumeLine(line: Buffer): void {
    let value: unknown;
    try {
      value = JSON.parse(line.toString("utf8"));
    } catch {
      this.quarantine("desktop helper emitted malformed MCP JSON");
      return;
    }
    const response = asRecord(value);
    if (!response || response.jsonrpc !== "2.0") {
      this.quarantine("desktop helper emitted an invalid MCP response envelope");
      return;
    }
    if (!("id" in response)) {
      // Server notifications are permitted and have no request id.
      if (typeof response.method === "string") return;
      this.quarantine("desktop helper emitted an MCP response without an id");
      return;
    }

    const pending = this.pending;
    if (!pending || response.id !== pending.id) {
      this.quarantine("desktop helper emitted an unexpected or mismatched MCP response id");
      return;
    }
    this.pending = undefined;
    clearTimeout(pending.timer);

    const hasResult = Object.prototype.hasOwnProperty.call(response, "result");
    const hasError = Object.prototype.hasOwnProperty.call(response, "error");
    if (hasResult === hasError) {
      pending.reject(driverError("desktop helper emitted an invalid MCP result/error envelope", "mcp_protocol_error"));
      this.quarantine("invalid MCP result/error envelope");
      return;
    }
    if (hasError) {
      const rpcError = asRecord(response.error);
      if (!rpcError || !Number.isSafeInteger(rpcError.code) || typeof rpcError.message !== "string") {
        pending.reject(driverError("desktop helper emitted a malformed MCP error envelope", "mcp_protocol_error"));
        this.quarantine("malformed MCP error envelope");
        return;
      }
      const rpcCode = rpcError.code as number;
      const message = boundedText(rpcError.message);
      pending.reject(driverError(`MCP JSON-RPC error${rpcCode === undefined ? "" : ` ${rpcCode}`}: ${message}`, "mcp_json_rpc_error", {
        rpcCode,
        message,
        delivery: pending.method === "tools/call" ? "unknown" : "not_dispatched",
      }));
      this.quarantine(`MCP JSON-RPC error during ${pending.method}`);
      return;
    }
    pending.resolve(response.result);
  }

  private retainStderr(chunk: Buffer): void {
    if (this.maxStderrBytes === 0) return;
    const suffix = chunk.length > this.maxStderrBytes ? chunk.subarray(chunk.length - this.maxStderrBytes) : chunk;
    const combined = Buffer.concat([this.stderrTail, suffix]);
    this.stderrTail = combined.length > this.maxStderrBytes
      ? combined.subarray(combined.length - this.maxStderrBytes)
      : combined;
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    if (this.pending) return Promise.reject(driverError("MCP request overlap violated serialized transport", "mcp_protocol_error"));
    const child = this.child;
    if (!child || !child.stdin.writable || this.quarantined) {
      return Promise.reject(driverError(this.closedMessage(), "mcp_transport_quarantined"));
    }
    const id = this.nextId++;
    const line = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    if (line.length > this.maxLineBytes) {
      return Promise.reject(driverError(`MCP request exceeded ${this.maxLineBytes} bytes`, "mcp_request_too_large"));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.id !== id) return;
        this.pending = undefined;
        reject(driverError(`MCP ${method} timed out after ${timeoutMs}ms; delivery is unknown and the request was not replayed.`, "mcp_transport_timeout", {
          method,
          delivery: "unknown",
        }));
        this.quarantine(`MCP ${method} timed out`);
      }, timeoutMs);
      this.pending = { id, method, resolve, reject, timer };
      child.stdin.write(line, (error) => {
        if (!error || this.pending?.id !== id) return;
        clearTimeout(timer);
        this.pending = undefined;
        reject(driverError(`MCP ${method} write failed; delivery is unknown and the request was not replayed.`, "mcp_transport_write_failed", {
          method,
          delivery: "unknown",
        }));
        this.quarantine(`MCP ${method} write failed`, error);
      });
    });
  }

  private notification(method: string, params: Record<string, unknown>): Promise<void> {
    const child = this.child;
    if (!child || !child.stdin.writable || this.quarantined) {
      return Promise.reject(driverError(this.closedMessage(), "mcp_transport_quarantined"));
    }
    const line = Buffer.from(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
    if (line.length > this.maxLineBytes) {
      return Promise.reject(driverError(`MCP notification exceeded ${this.maxLineBytes} bytes`, "mcp_request_too_large"));
    }
    return new Promise((resolve, reject) => child.stdin.write(line, (error) => {
      if (!error) resolve();
      else {
        reject(driverError(`MCP ${method} write failed`, "mcp_transport_write_failed"));
        this.quarantine(`MCP ${method} write failed`, error);
      }
    }));
  }

  private callTool(tool: string, args: Record<string, unknown>) {
    if (!this.toolNames?.has(tool)) {
      return Promise.reject(driverError(`desktop helper tools/list does not advertise ${JSON.stringify(tool)}`, "mcp_tool_unavailable"));
    }
    return this.request("tools/call", { name: tool, arguments: args }, this.callTimeoutMs)
      .then((result) => {
        if (!isCallToolResult(result)) {
          this.quarantine("desktop helper returned a malformed MCP CallToolResult");
          throw driverError(
            "desktop helper returned a malformed MCP CallToolResult; delivery is unknown and the request was not replayed.",
            "mcp_protocol_error",
            { delivery: "unknown" },
          );
        }
        return parseDriverOutput(JSON.stringify(result));
      });
  }

  private requireToolSuccess(tool: string, parsed: ReturnType<typeof parseDriverOutput>): DriverResult {
    const refusal = parseDriverRefusal(parsed.result.structured, parsed.result.text);
    if (parsed.isError || refusal) {
      throw driverError(
        refusal?.message || parsed.message || `${tool} failed.`,
        refusal?.code,
        parsed.result.structured,
      );
    }
    return parsed.result;
  }

  private canReviveExactSession(
    tool: string,
    payload: Record<string, unknown>,
    parsed: ReturnType<typeof parseDriverOutput>,
  ): boolean {
    if (tool === "start_session" || !this.session || payload.session !== this.session) return false;
    return isPreDispatchSessionEnded(parsed.result);
  }

  private quarantine(message: string, cause?: unknown): void {
    if (this.quarantined) return;
    this.quarantined = true;
    this.ready = false;
    this.quarantineMessage = cause instanceof Error ? `${message}: ${boundedText(cause.message)}` : message;
    const pending = this.pending;
    if (pending) {
      this.pending = undefined;
      clearTimeout(pending.timer);
      pending.reject(driverError(`${this.quarantineMessage}; delivery is unknown and the request was not replayed.`, "mcp_transport_quarantined", {
        method: pending.method,
        delivery: "unknown",
      }));
    }
    const child = this.child;
    if (child && !this.exitState) {
      child.stdin.destroy();
      this.forced = true;
      child.kill("SIGTERM");
      this.quarantineExit ??= (async () => {
        let exit = await this.waitForExit(this.killTimeoutMs);
        if (!exit) {
          child.kill("SIGKILL");
          exit = await this.waitForExit(this.killTimeoutMs);
        }
      })();
    }
  }

  private async finishClose(): Promise<TransportCloseReceipt> {
    const callsDrained = await settlesWithin([...this.admitted], this.drainTimeoutMs);
    if (!callsDrained) this.quarantine(`MCP admitted calls did not drain within ${this.drainTimeoutMs}ms`);
    const child = this.child;
    let stdinClosed = !child || Boolean(this.exitState);

    if (child && !this.exitState && !child.stdin.destroyed) {
      stdinClosed = await this.closeStdin(child, this.closeTimeoutMs);
    }

    let exit = this.exitState;
    if (this.quarantineExit) await this.quarantineExit;
    exit = this.exitState ?? exit;
    if (child && !exit) {
      exit = await this.waitForExit(this.closeTimeoutMs);
      if (!exit) {
        this.forced = true;
        child.kill("SIGTERM");
        exit = await this.waitForExit(this.killTimeoutMs);
      }
      if (!exit) {
        this.forced = true;
        child.kill("SIGKILL");
        exit = await this.waitForExit(this.killTimeoutMs);
      }
    }

    const exited = !child || Boolean(exit);
    const verified = callsDrained && stdinClosed && exited && !this.quarantined && !this.forced &&
      (!child || (exit?.code === 0 && exit.signal === null));
    return {
      kind: "mcp-stdio",
      instanceId: this.sessionOwnership.instanceId,
      admissionClosed: true,
      callsDrained,
      stdinClosed,
      exited,
      exitCode: exit?.code ?? null,
      signal: exit?.signal ?? null,
      forced: this.forced,
      verified,
      stderrTail: this.stderrTail.toString("utf8"),
    };
  }

  private waitForExit(timeoutMs: number): Promise<ExitState | undefined> {
    if (this.exitState) return Promise.resolve(this.exitState);
    return new Promise((resolve) => {
      const waiter = (state: ExitState) => {
        clearTimeout(timer);
        resolve(state);
      };
      const timer = setTimeout(() => {
        const index = this.exitWaiters.indexOf(waiter);
        if (index >= 0) this.exitWaiters.splice(index, 1);
        resolve(undefined);
      }, timeoutMs);
      this.exitWaiters.push(waiter);
    });
  }

  private closeStdin(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let finished = false;
      const settle = (closed: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        child.stdin.off("error", onError);
        resolve(closed);
      };
      const onError = () => settle(false);
      const timer = setTimeout(() => {
        settle(false);
        this.quarantine("MCP stdin close timed out");
      }, timeoutMs);
      child.stdin.once("error", onError);
      child.stdin.end(() => settle(true));
    });
  }

  private closedMessage(): string {
    return this.quarantineMessage ?? "persistent MCP transport is closing or closed";
  }
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) throw new TypeError(`${name} must be a positive integer`);
  return resolved;
}

function exactTarget(value: unknown): OpenSkyTarget {
  if (value === "mac" || value === "win" || value === "linux") return value;
  throw new TypeError("target must be one of mac, win, or linux");
}

function snapshotArgs(value: unknown, maxBytes: number): Record<string, unknown> {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw driverError(
      `MCP call arguments must be JSON-serializable${error instanceof Error ? `: ${boundedText(error.message)}` : ""}`,
      "mcp_invalid_arguments",
    );
  }
  if (serialized === undefined || Buffer.byteLength(serialized) > maxBytes) {
    throw driverError(`MCP call arguments must serialize within ${maxBytes} bytes`, "mcp_request_too_large");
  }
  const snapshot: unknown = JSON.parse(serialized);
  const record = asRecord(snapshot);
  if (!record) {
    throw driverError("MCP call arguments must serialize to a JSON object", "mcp_invalid_arguments");
  }
  return record;
}

function explicitSocket(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) {
    throw new TypeError("socket must be a non-empty path or named-pipe string");
  }
  return value;
}

function optionalNonemptyString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

function isCallToolResult(value: unknown): value is Record<string, unknown> {
  const result = asRecord(value);
  if (!result || !Array.isArray(result.content)) return false;
  if ("isError" in result && typeof result.isError !== "boolean") return false;
  return result.content.every((entry) => {
    const content = asRecord(entry);
    if (!content || typeof content.type !== "string") return false;
    if (content.type === "text") return typeof content.text === "string";
    if (content.type === "image") return typeof content.data === "string" && typeof content.mimeType === "string";
    return true;
  });
}

async function settlesWithin(work: Promise<unknown>[], timeoutMs: number): Promise<boolean> {
  if (work.length === 0) return true;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.allSettled(work).then(() => true),
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function boundedText(value: string, limit = 4_000): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 16)} …[truncated]…`;
}
