import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluationEnvironment } from "./codex.js";

/** Exercise the real agent-facing native MCP transport without a model call. */
export async function verifyNativeLinuxRepl(config: { command: string; args: string[]; env: Record<string, string> }, artifacts: string) {
  if (process.platform !== "linux" || process.env.GITHUB_ACTIONS !== "true") throw new Error("Disposable Linux CI required");
  const child = spawn(config.command, config.args, { env: { ...evaluationEnvironment(), ...config.env }, detached: true, stdio: ["pipe", "pipe", "pipe"] });
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
    if (!tools.tools?.some((tool: { name: string }) => tool.name === "js")) throw new Error("Native REPL did not expose js");
    const imported = await request("tools/call", { name: "js", arguments: { code: 'globalThis.sky = (await import("@oai/sky")).sky;', title: "Initialize native Linux API" } });
    if (imported.isError) throw new Error(JSON.stringify(imported));
    const observed = await request("tools/call", { name: "js", arguments: { code: 'var images = await sky.get_screenshot(); await nodeRepl.emitImage(images[0].data_url);', title: "Observe disposable Linux desktop" } });
    const images = observed.content?.filter((item: { type: string }) => item.type === "image") ?? [];
    if (observed.isError || !images.length || !images[0].data) throw new Error(`Native REPL did not deliver an image: ${JSON.stringify(observed)}`);
    await writeFile(join(artifacts, "native-repl-image.bin"), Buffer.from(images[0].data, "base64"));
    result = { passed: true, agentEvaluation: false, serverInfo: initialized.serverInfo, tools: tools.tools.map((tool: { name: string }) => tool.name), imageCount: images.length, mimeType: images[0].mimeType };
  } catch (error) {
    result.error = String(error);
    throw error;
  } finally {
    child.stdin.end();
    const terminate = setTimeout(() => { try { process.kill(-child.pid!, "SIGTERM"); } catch {} }, 2_000);
    const kill = setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch {} }, 4_000);
    await closed;
    clearTimeout(terminate); clearTimeout(kill);
    rejectPending(new Error("Probe ended"));
    await writeFile(join(artifacts, "native-repl-probe.json"), JSON.stringify(result, null, 2));
    await writeFile(join(artifacts, "native-repl-stderr.log"), stderr);
  }
}
