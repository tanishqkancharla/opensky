import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type CuaReplResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  structuredContent?: { cellId: string; cellStatus: "running" | "completed" };
};
export type CuaReplClient = { cell(code: string): Promise<CuaReplResult> };

/** Actual evaluation MCP transport; no model, synthetic driver, or alternate CUA bridge. */
export async function withOwnedCuaRepl<T>(artifacts: string, use: (repl: CuaReplClient) => Promise<T>): Promise<T> {
  return withOwnedDesktopRepl("opensky", artifacts, use);
}

/** Both transports keep their installed REPL and execute the caller's code unchanged. */
export async function withOwnedDesktopRepl<T>(backend: "native" | "opensky", artifacts: string, use: (repl: CuaReplClient) => Promise<T>): Promise<T> {
  if (process.env.PARITY_DISPATCH_POLICY || process.env.PARITY_DISPATCH_RECEIPT) {
    throw new Error("Deterministic REPL reproduction cannot inherit a paid evaluation admission; use a clean test environment");
  }
  if (backend === "native" && !process.env.OPENSKY_NATIVE_REPL_CONFIG) {
    throw new Error("Native REPL acceptance needs the installed native launcher configuration; no substitute backend was started");
  }
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const directory = resolve(artifacts);
  await mkdir(directory, { recursive: true });
  const child = spawn(process.execPath, ["--import", resolve(root, "node_modules/tsx/dist/loader.mjs"), resolve(root, `evals/parity/${backend}-mcp.ts`)], {
    cwd: root,
    env: { ...process.env, OPENSKY_HOME: directory,
      PARITY_DESKTOP_SCOPE: JSON.stringify({ backend, appSelectors: ["LibreOffice"], isolatedDesktop: "linux" }) },
    detached: true, stdio: ["pipe", "pipe", "pipe"],
  });
  const closed = new Promise<void>(done => child.once("close", () => done()));
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let sequence = 0, stderr = "", inFlight = false;
  let transportError: Error | undefined;
  let receiptQueue: Promise<void> = Promise.resolve();
  const retain = (value: unknown) => {
    receiptQueue = receiptQueue.then(() => appendFile(resolve(directory, "rpc.jsonl"), JSON.stringify(value) + "\n"));
    return receiptQueue;
  };
  child.stderr.on("data", data => { stderr += data; });
  const fail = (error: Error) => {
    transportError = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  child.stdin.on("error", fail);
  child.on("error", fail);
  child.on("exit", (code, signal) => fail(new Error(`REPL process exited (${code ?? signal})`)));
  const lines = createInterface({ input: child.stdout });
  lines.on("line", line => {
    try {
      const message = JSON.parse(line);
      if (message.method) {
        // These deterministic Linux calls must not silently grant a new
        // permission. Retain and reject any unexpected reverse request.
        if (message.id !== undefined) {
          void retain({ direction: "server-request", message });
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: message.id,
            error: { code: -32601, message: "Unexpected server request during deterministic desktop regression" } }) + "\n");
        }
        return;
      }
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(JSON.stringify(message.error)));
      else request?.resolve(message.result);
    } catch (error) { fail(new Error(String(error))); }
  });
  const request = async (method: string, params: unknown): Promise<unknown> => {
    if (transportError) throw transportError;
    const id = ++sequence;
    const message = { jsonrpc: "2.0", id, method, params };
    const started = Date.now();
    await retain({ direction: "request", at: new Date().toISOString(), message });
    try {
      const result = await new Promise<unknown>((done, reject) => {
        // Each transport wait yields within 30 seconds. This detects a broken
        // round trip, not a cell execution deadline; pending cells keep running.
        const timer = setTimeout(() => {
          const error = new Error("One MCP round trip exceeded 45 seconds; no code replayed");
          fail(error);
        }, 45_000);
        pending.set(id, {
          resolve: value => { clearTimeout(timer); done(value); },
          reject: error => { clearTimeout(timer); reject(error); },
        });
        child.stdin.write(JSON.stringify(message) + "\n", error => { if (error) fail(error); });
      });
      await retain({ direction: "response", id, elapsedMs: Date.now() - started, result });
      return result;
    } catch (error) {
      await retain({ direction: "error", id, elapsedMs: Date.now() - started, error: String(error) });
      throw error;
    }
  };
  const call = async (name: string, args: unknown): Promise<CuaReplResult> => {
    const result = await request("tools/call", { name, arguments: args }) as CuaReplResult;
    if (!result || !Array.isArray(result.content)) throw new Error("MCP returned no content receipt");
    return result;
  };
  try {
    await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "opensky-public-repl-test", version: "1" } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    return await use({ async cell(code) {
      if (inFlight) throw new Error("A REPL cell is already pending; concurrent submission refused");
      inFlight = true;
      try {
        let result = backend === "native"
          ? await call("js", { code, title: "Drive the test document through native desktop calls" })
          : await call("cua_repl", { code, yield_time_ms: 0 });
        const id = result.structuredContent?.cellId;
        while (result.structuredContent?.cellStatus === "running") {
          if (!id || result.structuredContent.cellId !== id || result.isError) throw new Error("Invalid pending cell receipt; no code replayed");
          result = await call("cua_repl_wait", { cell_id: id });
        }
        if (id && (result.structuredContent?.cellId !== id || result.structuredContent.cellStatus !== "completed")) {
          throw new Error("Missing completion for original REPL cell; no code replayed");
        }
        return result;
      } finally { inFlight = false; }
    } });
  } finally {
    child.stdin.end();
    const signals: string[] = [];
    const signal = (value: "SIGTERM" | "SIGKILL") => {
      if (!child.pid) return;
      try { process.kill(-child.pid, value); signals.push(value); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") signals.push(`${value}: ${String(error)}`);
      }
    };
    const term = setTimeout(() => signal("SIGTERM"), 2_000);
    const kill = setTimeout(() => signal("SIGKILL"), 4_000);
    await closed;
    clearTimeout(term); clearTimeout(kill); lines.close();
    const groupGone = () => {
      if (!child.pid) return true;
      try { process.kill(-child.pid, 0); return false; }
      catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
    };
    if (!groupGone()) {
      // A descendant can outlive the stdio owner; retain ownership cleanup.
      signal("SIGTERM");
      await new Promise(done => setTimeout(done, 2_000));
      if (!groupGone()) {
        signal("SIGKILL");
        await new Promise(done => setTimeout(done, 100));
      }
    }
    const groupExited = groupGone();
    await writeFile(resolve(directory, "stderr.log"), stderr);
    await writeFile(resolve(directory, "mcp-cleanup.json"), JSON.stringify({ pid: child.pid ?? null,
      exitCode: child.exitCode, signalCode: child.signalCode, groupExited, signals }, null, 2));
    await receiptQueue;
    if (!groupExited) throw new Error("Owned MCP process group remains alive after close; inspect cleanup receipt");
  }
}
