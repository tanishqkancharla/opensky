import { parseDriverOutput } from "../src/driver.js";
import type { DriverClient, DriverResult } from "../src/types.js";
import type { EvalVm } from "./vm.js";

export class FleetMcpDriver implements DriverClient {
  private nextId = 1;
  private sessionId: string | null = null;
  private initialized = false;

  constructor(private readonly vm: EvalVm) {}

  async call(tool: string, args: Record<string, unknown> = {}): Promise<DriverResult> {
    await this.ensureSession();
    const payload = await this.rpc("tools/call", { name: tool, arguments: args });
    const parsed = parseDriverOutput(payload);
    if (parsed.isError) {
      throw new Error(parsed.message || `${tool} failed`);
    }
    return parsed.result;
  }

  async status(): Promise<{ running: boolean; text: string }> {
    return { running: true, text: `fleet ${this.vm.name}` };
  }

  async ensureDaemon(): Promise<void> {
    await this.ensureSession();
  }

  private async ensureSession(): Promise<void> {
    if (this.initialized) return;
    const init = await this.rpc(
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "opensky-evals", version: "0.1.0" },
      },
      { initialize: true },
    );
    if (!init) {
      throw new Error("Failed to initialize Cua Driver MCP on the Fleet VM.");
    }
    try {
      await this.rpc("notifications/initialized", {}, { notification: true });
    } catch {
      // Some servers do not implement notifications/initialized.
    }
    this.initialized = true;
  }

  private async rpc(
    method: string,
    params: Record<string, unknown>,
    options: { initialize?: boolean; notification?: boolean } = {},
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const body = options.notification
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", id: this.nextId++, method, params };
    const response = await this.vm.mcp(body, headers);
    const session = response.headers.get("mcp-session-id") ?? response.headers.get("Mcp-Session-Id");
    if (session) this.sessionId = session;
    if (options.notification) return "";
    if (response.status >= 400) {
      throw new Error(`MCP ${method} failed (${response.status}): ${response.text}`);
    }
    const text = unwrapSse(response.text);
    if (options.initialize) return text;
    const parsed = jsonObject(text);
    if (parsed && typeof parsed.error === "object" && parsed.error) {
      const error = parsed.error as { message?: string };
      throw new Error(error.message ?? `${method} error`);
    }
    if (parsed && "result" in parsed) {
      return JSON.stringify(parsed.result);
    }
    return text;
  }
}

function unwrapSse(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("event:") && !trimmed.includes("data:")) return trimmed;
  const data = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n")
    .trim();
  return data || trimmed;
}

function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
