import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { OpenSkyTarget } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const proxyScript = join(here, "scripts", "fleet_proxy.py");

export type EvalVm = {
  name: string;
  os: OpenSkyTarget;
  baseUrl: string;
  mcp: (body: unknown, headers?: Record<string, string>) => Promise<{ status: number; headers: Headers; text: string }>;
  shell: (command: string) => Promise<{ success: boolean; stdout: string; stderr: string }>;
  screenshot: () => Promise<Buffer>;
  close: () => Promise<void>;
};

function hasFleetCredentials(): boolean {
  return Boolean(process.env.FLEETS_TOKEN || (process.env.CUA_CLIENT_ID && process.env.CUA_CLIENT_SECRET));
}

function resolveUv(): string[] {
  if (process.env.EVAL_PYTHON) return [process.env.EVAL_PYTHON, proxyScript];
  return ["uv", "run", "--with", "cua-sandbox", "--with", "aiohttp", "--python", "3.12", proxyScript];
}

export async function claimEvalVm(): Promise<EvalVm> {
  if (!hasFleetCredentials()) {
    throw new Error(
      "Cua Fleet credentials are required. Set FLEETS_TOKEN, or CUA_CLIENT_ID and CUA_CLIENT_SECRET.",
    );
  }

  const child = spawn(resolveUv()[0], resolveUv().slice(1), {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const ready = await waitForReady(child);
  const baseUrl = `http://127.0.0.1:${ready.port}`;
  const os = normalizeOs(ready.os);

  return {
    name: ready.name ?? "sandbox",
    os,
    baseUrl,
    async mcp(body, headers = {}) {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...headers,
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, headers: response.headers, text: await response.text() };
    },
    async shell(command) {
      const response = await fetch(`${baseUrl}/shell`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const payload = (await response.json()) as { success?: boolean; stdout?: string; stderr?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `VM shell failed (${response.status})`);
      }
      return {
        success: payload.success === true,
        stdout: payload.stdout ?? "",
        stderr: payload.stderr ?? "",
      };
    },
    async screenshot() {
      const response = await fetch(`${baseUrl}/screenshot`);
      if (!response.ok) throw new Error(`VM screenshot failed (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    },
    async close() {
      try {
        await fetch(`${baseUrl}/shutdown`, { method: "POST" });
      } catch {
        // The proxy may already be gone.
      }
      child.kill("SIGTERM");
      await waitForExit(child, 20_000);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await waitForExit(child, 5_000);
      }
    },
  };
}

function normalizeOs(value: string | undefined): OpenSkyTarget {
  if (value === "macos" || value === "mac" || value === "darwin") return "mac";
  if (value === "windows" || value === "win") return "win";
  return "linux";
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener("close", onClose);
      resolve();
    }, timeoutMs);
    const onClose = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once("close", onClose);
  });
}

function waitForReady(child: ChildProcess): Promise<{ port: number; name?: string; os?: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error(`Timed out waiting for Cua Fleet VM. ${stderr.trim()}`));
    }, 1_800_000);

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const succeed = (value: { port: number; name?: string; os?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout
        .split("\n")
        .map((item) => item.trim())
        .find((item) => item.startsWith("{") && item.includes('"ready"'));
      if (!line) return;
      try {
        const parsed = JSON.parse(line) as { ready?: boolean; port?: number; name?: string; os?: string };
        if (parsed.ready && typeof parsed.port === "number") {
          succeed({ port: parsed.port, name: parsed.name, os: parsed.os });
        }
      } catch {
        // Keep reading until a complete JSON line arrives.
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });
    child.on("close", (code) => {
      fail(new Error(`Fleet proxy exited ${code ?? 1}. ${stderr.trim()}`));
    });
  });
}
