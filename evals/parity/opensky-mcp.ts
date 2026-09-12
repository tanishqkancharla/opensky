import { createInterface } from "node:readline";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCuaReplToolRuntime } from "../cua-repl-tool.js";
import { OpenSkyDriverClient } from "../../src/driver.js";
import { detectTarget } from "../../src/platform.js";
import { DesktopProgramPolicy } from "./desktop-program.js";
import { configuredAdmission, limitResponse } from "./admission.js";
import { verifyDriverRuntime } from "./driver-runtime.js";

// A transport adapter around the existing public cua REPL. No test actions,
// fabricated observations, or agent-side filesystem access are added here.
const homeDir = process.env.OPENSKY_HOME;
const binaryPath = process.env.OPENSKY_DRIVER_BINARY;
if (!homeDir || !binaryPath) throw new Error("Provide OPENSKY_HOME and OPENSKY_DRIVER_BINARY; automatic installation/start is disabled.");
await mkdir(homeDir, { recursive: true });
const socket = process.env.OPENSKY_DRIVER_SOCKET ?? process.env.CUA_DRIVER_SOCKET;
await verifyDriverRuntime({ binaryPath, socket, artifacts: homeDir,
  ...(process.platform === "linux" ? { ownedLinuxPid: Number(process.env.OPENSKY_OWNED_DRIVER_PID) } : {}) });
// Optional passive diagnostics for deterministic reproductions. Retain the
// actual driver's result before the public facade reduces it. Buffer in memory
// so recording adds no filesystem wait between consecutive input calls.
const inputResults: unknown[] = [];
class InputReceiptDriver extends OpenSkyDriverClient {
  override async call(tool: string, args: Record<string, unknown> = {}) {
    if (tool !== "type_text" && tool !== "press_key") return super.call(tool, args);
    const startedAt = new Date().toISOString();
    const started = performance.now();
    try {
      const result = await super.call(tool, args);
      inputResults.push({ tool, args, startedAt, elapsedMs: performance.now() - started, result });
      return result;
    } catch (error) {
      inputResults.push({ tool, args, startedAt, elapsedMs: performance.now() - started,
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error) });
      throw error;
    }
  }
}
const recordInputResults = process.env.OPENSKY_RECORD_INPUT_RESULTS === "1";
const Driver = recordInputResults ? InputReceiptDriver : OpenSkyDriverClient;
const driver = new Driver({ binaryPath, socket, autoInstall: false, autoStart: false });
const runtime = createCuaReplToolRuntime(driver, detectTarget(), { homeDir });
const policy = process.env.PARITY_DESKTOP_SCOPE && new DesktopProgramPolicy(JSON.parse(process.env.PARITY_DESKTOP_SCOPE));
const admission = configuredAdmission();
const input = createInterface({ input: process.stdin });
let queue = Promise.resolve();
const send = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
input.on("line", line => {
  queue = queue.then(async () => {
    let request: any;
    try {
      request = JSON.parse(line);
      if (request.id === undefined) return;
      let result: unknown;
      switch (request.method) {
        case "initialize": result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "opensky-public-cua", version: "1" } }; break;
        case "ping": result = {}; break;
        case "tools/list": result = { tools: runtime.tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters })) }; break;
        case "tools/call": {
          if (policy && request.params?.name !== "cua_repl_wait" && !policy.accepts(request.params?.arguments?.code)) {
            result = { isError: true, content: [{ type: "text", text: "Evaluation scope: use public cua calls for the fixture app only. Expressions, if statements and for/for-of/while loops are supported. No helper functions or other apps." }] };
            break;
          }
          const tool = runtime.tools.find(tool => tool.name === request.params?.name);
          if (!tool) throw new Error("Unknown public tool");
          const limit = admission?.admit();
          if (limit) { result = limitResponse(limit); break; }
          // This runtime's implementation takes only id and params. Pi's
          // generic declaration widens it with unused host-context arguments.
          const execute = tool.execute as unknown as (id: string, params: Record<string, unknown>) => Promise<{ content: unknown; isError?: boolean; details?: unknown }>;
          const response = await execute(String(request.id), request.params.arguments);
          await appendFile(join(homeDir, "cua-trace.jsonl"), `${JSON.stringify(response.details)}\n`);
          const cell = response.details as { cellId?: string; cellStatus?: string } | undefined;
          result = { content: response.content, isError: response.isError ?? false,
            ...(cell?.cellId ? { structuredContent: { cellId: cell.cellId, cellStatus: cell.cellStatus } } : {}) };
          break;
        }
        default: send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } }); return;
      }
      send({ jsonrpc: "2.0", id: request.id, result });
    } catch (error) {
      send({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
    }
  });
});
input.on("close", () => {
  void queue.finally(async () => {
    try { await runtime.close(); }
    finally {
      if (recordInputResults) await writeFile(join(homeDir, "driver-input-results.json"), JSON.stringify(inputResults, null, 2));
    }
  }).catch(error => { console.error(error); process.exitCode = 1; });
});
