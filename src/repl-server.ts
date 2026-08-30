import { createServer, connect, type Server, type Socket } from "node:net";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspect } from "node:util";

import { AsyncRepl } from "./async-repl.js";
import { homeDir } from "./platform.js";

export interface ReplEvalRequest {
  code: string;
  filename?: string;
}

export interface ReplEvalResponse {
  ok: boolean;
  value?: unknown;
  inspected?: string;
  logs: string[];
  error?: string;
}

export class ReplServer {
  private server: Server | null = null;
  constructor(
    private readonly repl: AsyncRepl,
    private readonly home: string,
  ) {}

  get infoPath(): string {
    return join(this.home, "repl.json");
  }

  async start(port = 0): Promise<{ port: number; pid: number }> {
    await mkdir(this.home, { recursive: true });
    this.server = createServer((socket) => {
      this.handle(socket);
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(port, "127.0.0.1", () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind ccua REPL server");
    }
    const info = { port: address.port, pid: process.pid, host: "127.0.0.1" };
    await writeFile(this.infoPath, JSON.stringify(info, null, 2));
    return info;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
    await rm(this.infoPath, { force: true });
  }

  private handle(socket: Socket): void {
    socket.setEncoding("utf8");
    let buffer = "";
    let closed = false;
    const finish = (response: ReplEvalResponse) => {
      if (closed) return;
      closed = true;
      socket.end(`${JSON.stringify(response)}\n`);
    };
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (!buffer.includes("\n")) return;
      const raw = buffer.slice(0, buffer.indexOf("\n")).trim();
      void this.evaluate(raw).then(finish, (error) => {
        finish({
          ok: false,
          logs: [],
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
    socket.on("error", () => undefined);
  }

  private async evaluate(raw: string): Promise<ReplEvalResponse> {
    const request = JSON.parse(raw) as ReplEvalRequest;
    try {
      const result = await this.repl.evaluate(request.code, request.filename ?? "ccua-eval");
      return {
        ok: true,
        value: jsonSafe(result.value),
        inspected: inspect(result.value, { depth: 6, colors: false }),
        logs: result.logs,
      };
    } catch (error) {
      return {
        ok: false,
        logs: error && typeof error === "object" && "logs" in error ? (error as { logs: string[] }).logs : [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export async function evalOnServer(
  code: string,
  options: { homeDir?: string; filename?: string } = {},
): Promise<ReplEvalResponse> {
  const home = homeDir(options.homeDir);
  const info = JSON.parse(await readFile(join(home, "repl.json"), "utf8")) as {
    host: string;
    port: number;
  };
  const payload = `${JSON.stringify({ code, filename: options.filename ?? "ccua-eval" })}\n`;
  return new Promise((resolve, reject) => {
    const socket = connect(info.port, info.host);
    socket.setEncoding("utf8");
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("ccua REPL server timed out"));
    }, 15_000);
    socket.on("connect", () => {
      socket.write(payload);
    });
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const idx = buffer.indexOf("\n");
      if (idx === -1) return;
      clearTimeout(timer);
      socket.end();
      try {
        resolve(JSON.parse(buffer.slice(0, idx)) as ReplEvalResponse);
      } catch (error) {
        reject(error);
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export async function readServerInfo(home = homeDir()): Promise<{ host: string; port: number; pid: number } | null> {
  try {
    return JSON.parse(await readFile(join(home, "repl.json"), "utf8")) as {
      host: string;
      port: number;
      pid: number;
    };
  } catch {
    return null;
  }
}

export async function serverAlive(home = homeDir()): Promise<boolean> {
  const info = await readServerInfo(home);
  if (!info) return false;
  try {
    process.kill(info.pid, 0);
    return true;
  } catch {
    await rm(join(home, "repl.json"), { force: true });
    return false;
  }
}

export async function ensureHome(dir = homeDir()): Promise<string> {
  await mkdir(dir, { recursive: true });
  return dir;
}

function jsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return inspect(value, { depth: 4, colors: false });
  }
}
