import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base } from "./linux-typing.js";
import { expect } from "vitest";

type Result = { isError?: boolean; content: unknown[]; structuredContent?: { cellId: string; cellStatus: string } };
type Repl = { start(code: string): Promise<Result>; wait(cellId: string): Promise<Result>; finish(cellId: string): Promise<Result> };
export const test = base.extend<{ repl: Repl }>({
  repl: async ({ app, task }, use) => {
    void app; // The shared fixture owns the real, ready Writer document.
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const artifacts = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "typing", task.name.split(":")[0], "repl");
    await mkdir(artifacts, { recursive: true });
    const child = spawn(process.execPath, ["--import", resolve(root, "node_modules/tsx/dist/loader.mjs"), resolve(root, "evals/parity/opensky-mcp.ts")], {
      cwd: root, env: { ...process.env, OPENSKY_HOME: artifacts,
        PARITY_DESKTOP_SCOPE: JSON.stringify({ backend: "opensky", appSelectors: ["LibreOffice"], isolatedDesktop: "linux" }) },
      detached: true, stdio: ["pipe", "pipe", "pipe"],
    });
    const closed = new Promise<void>(done => child.once("close", () => done()));
    const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
    let sequence = 0, stderr = "";
    child.stderr.on("data", data => { stderr += data; });
    const fail = (error: Error) => { for (const request of pending.values()) request.reject(error); pending.clear(); };
    child.on("error", fail);
    child.on("exit", () => fail(new Error("REPL process exited")));
    createInterface({ input: child.stdout }).on("line", line => {
      try {
        const message = JSON.parse(line), request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request?.reject(new Error(JSON.stringify(message.error)));
        else request?.resolve(message.result);
      } catch (error) { fail(new Error(String(error))); }
    });
    const request = (method: string, params: unknown) => new Promise<any>((done, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("One MCP round trip exceeded 45 seconds")); }, 45_000);
      pending.set(id, { resolve: result => { clearTimeout(timer); done(result); }, reject: error => { clearTimeout(timer); reject(error); } });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
    const call = async (name: string, args: unknown): Promise<Result> => {
      const startedAt = Date.now();
      const result = await request("tools/call", { name, arguments: args });
      await appendFile(resolve(artifacts, "rpc.jsonl"), JSON.stringify({ name, elapsedMs: Date.now() - startedAt, result }) + "\n");
      return result;
    };
    const wait = (cellId: string) => call("cua_repl_wait", { cell_id: cellId });
    try {
      await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "opensky-public-repl-test", version: "1" } });
      await use({ start: code => call("cua_repl", { code, yield_time_ms: 0 }), wait,
        async finish(id) { let result: Result; do { result = await wait(id); } while (!result.isError && result.structuredContent?.cellStatus === "running"); return result; },
      });
    } finally {
      child.stdin.end();
      const term = setTimeout(() => { try { process.kill(-child.pid!, "SIGTERM"); } catch {} }, 2_000);
      const kill = setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch {} }, 4_000);
      await closed;
      clearTimeout(term); clearTimeout(kill);
      await writeFile(resolve(artifacts, "stderr.log"), stderr);
    }
  },
});
export { expect };
