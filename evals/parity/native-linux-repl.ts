import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluationEnvironment } from "./codex.js";
import { assertDisposableLinuxDesktop } from "./linux-app.js";

export type NativeLinuxReplConfig = { command: string; args: string[]; env: Record<string, string> };
export type NativeLinuxReplResult = { isError?: boolean; content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }> };
/** Own the actual native transport; deterministic callers supply public calls only. */
export async function withLinuxRepl<T>(config: NativeLinuxReplConfig, artifacts: string,
  use: (cell: (code: string) => Promise<NativeLinuxReplResult>) => Promise<T>,
  options: { toolName?: "js" | "cua_repl"; artifactPrefix?: "native-repl" | "opensky-agent-repl" } = {}): Promise<T> {
  assertDisposableLinuxDesktop();
  const toolName = options.toolName ?? "js";
  const artifactPrefix = options.artifactPrefix ?? "native-repl";
  const child = spawn(config.command, config.args, { env: { ...evaluationEnvironment(), ...config.env }, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  const signals: string[] = [];
  const signal = (value: "SIGTERM" | "SIGKILL") => {
    if (!child.pid) return;
    try { process.kill(-child.pid, value); signals.push(value); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") signals.push(`${value}: ${String(error)}`);
    }
  };
  const groupGone = () => {
    if (!child.pid) return true;
    try { process.kill(-child.pid, 0); return false; }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
  };
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  let sequence = 0;
  let stderr = "";
  child.stderr.on("data", bytes => { stderr += bytes; });
  const rejectPending = (error: Error) => { for (const request of pending.values()) request.reject(error); pending.clear(); };
  child.on("error", rejectPending);
  child.on("exit", (code, signal) => rejectPending(new Error(`Native REPL exited (${code ?? signal})`)));
  createInterface({ input: child.stdout }).on("line", line => {
    try {
      const message = JSON.parse(line);
      if (message.method) {
        if (message.id !== undefined) child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Unexpected request during read-only Linux transport probe" } })}\n`);
        return;
      }
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(JSON.stringify(message.error)));
      else request?.resolve(message.result);
    } catch (error) { rejectPending(error instanceof Error ? error : new Error(String(error))); }
  });
  const request = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
    const id = ++sequence;
    // A bounded deterministic transport probe; no whole-agent task deadline.
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Native REPL ${method} did not respond`)); }, 45_000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
  let result: Record<string, unknown> = { passed: false, agentEvaluation: false };
  try {
    const initialized = await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "opensky-linux-transport-probe", version: "1" } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const tools = await request("tools/list", {});
    if (!tools.tools?.some((tool: { name: string }) => tool.name === toolName)) throw new Error(`Desktop REPL did not expose ${toolName}`);
    const value = await use(async code => {
      const started = Date.now();
      const observed = await request("tools/call", { name: toolName, arguments: { code, title: "Verify the owned Linux document through native computer use" } });
      // Images stay in normal MCP receipts; no summary substitutes the response.
      await appendFile(join(artifacts, `${artifactPrefix}-calls.jsonl`), JSON.stringify({ code, elapsedMs: Date.now() - started, result: observed }) + "\n");
      if (observed.isError) throw new Error(JSON.stringify(observed));
      return observed;
    });
    result = { passed: true, agentEvaluation: false, ...(config.env.CUA_REPL_ENABLED_SURFACES === "computer" ? { interface: "current-cua-facade" } : {}), serverInfo: initialized.serverInfo, tools: tools.tools.map((tool: { name: string }) => tool.name) };
    return value;
  } catch (error) {
    result.error = String(error);
    throw error;
  } finally {
    child.stdin.end();
    const terminate = setTimeout(() => signal("SIGTERM"), 2_000);
    const kill = setTimeout(() => signal("SIGKILL"), 4_000);
    await closed;
    clearTimeout(terminate); clearTimeout(kill);
    rejectPending(new Error("Probe ended"));
    if (!groupGone()) {
      signal("SIGTERM");
      await new Promise(done => setTimeout(done, 2_000));
      if (!groupGone()) { signal("SIGKILL"); await new Promise(done => setTimeout(done, 100)); }
    }
    const groupExited = groupGone();
    await writeFile(join(artifacts, `${artifactPrefix}-cleanup.json`), JSON.stringify({ pid: child.pid, groupExited, signals }, null, 2));
    await writeFile(join(artifacts, `${artifactPrefix}-probe.json`), JSON.stringify(result, null, 2));
    await writeFile(join(artifacts, `${artifactPrefix}-stderr.log`), stderr);
    if (!groupExited) throw new Error("Owned native REPL process group remains alive after close");
  }
}

/** Preserve the original native helper API and artifact names. */
export function withNativeLinuxRepl<T>(config: NativeLinuxReplConfig, artifacts: string,
  use: (cell: (code: string) => Promise<NativeLinuxReplResult>) => Promise<T>): Promise<T> {
  return withLinuxRepl(config, artifacts, use);
}

/** Exercise the real agent-facing native MCP transport without a model call. */
export async function verifyNativeLinuxRepl(config: NativeLinuxReplConfig, artifacts: string) {
  await withNativeLinuxRepl(config, artifacts, async cell => {
    if (config.env.CUA_REPL_ENABLED_SURFACES === "computer") {
      await cell('await import("@oai/cua/tinyskyAlt");');
      await cell('await cua.listWindows();');
    }
    await cell('globalThis.sky = (await import("@oai/sky")).sky;');
    const observed = await cell('var images = await sky.get_screenshot(); await nodeRepl.emitImage(images[0].data_url);');
    const images = observed.content?.filter(item => item.type === "image") ?? [];
    if (!images.length || !images[0].data) throw new Error(`Native REPL did not deliver an image: ${JSON.stringify(observed)}`);
    await writeFile(join(artifacts, "native-repl-image.bin"), Buffer.from(images[0].data, "base64"));
  });
}
