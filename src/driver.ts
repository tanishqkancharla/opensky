import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { driverError } from "./errors.js";
import { detectTarget } from "./platform.js";
import type { DriverClient, DriverResult, OpenSkyTarget } from "./types.js";

export interface CuaDriverOptions {
  binaryPath?: string;
  appPath?: string;
  timeoutMs?: number;
  autoStart?: boolean;
  startTimeoutMs?: number;
  session?: string;
  socket?: string;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class CuaDriverClient implements DriverClient {
  constructor(private readonly options: CuaDriverOptions = {}) {}

  async call(tool: string, args: Record<string, unknown> = {}): Promise<DriverResult> {
    await this.ensureDaemon();
    const payload = { ...args };
    if (this.options.session && payload.session === undefined) {
      payload.session = this.options.session;
    }

    const result = await this.execDriver(this.callArgs(tool, payload), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (result.code !== 0 && !result.stdout.trim()) {
      throw driverError((result.stderr || result.stdout || `${tool} failed with exit ${result.code}`).trim());
    }

    const parsed = parseDriverOutput(result.stdout);
    if (parsed.isError || result.code !== 0) {
      throw driverError(parsed.message || result.stderr.trim() || `${tool} failed.`);
    }
    return parsed.result;
  }

  async status(): Promise<{ running: boolean; text: string }> {
    const binary = await this.resolveBinary();
    if (!binary) {
      return { running: false, text: "cua-driver binary not found" };
    }
    const result = await this.exec(binary, this.withSocket(["status"]), 4_000);
    return {
      running: result.code === 0,
      text: (result.stdout || result.stderr).trim() || `exit ${result.code}`,
    };
  }

  async ensureDaemon(): Promise<void> {
    const status = await this.status();
    if (status.running) return;
    if (this.options.autoStart === false) {
      throw driverError(
        "cua-driver daemon is not running. Start it with `cua-driver serve` or `open -n -g -a CuaDriver --args serve`.",
      );
    }

    const binary = await this.requireBinary();
    const target = detectTarget();
    if (target === "mac") {
      const appPath = this.options.appPath ?? "/Applications/CuaDriver.app";
      const opened = await this.exec("/usr/bin/open", ["-n", "-g", appPath, "--args", "serve", "--no-overlay"], 3_000);
      if (opened.code !== 0) {
        await this.spawnDetached(binary, ["serve", "--no-overlay"]);
      }
    } else {
      await this.spawnDetached(binary, ["serve", "--no-overlay"]);
    }

    const deadline = Date.now() + (this.options.startTimeoutMs ?? 10_000);
    while (Date.now() < deadline) {
      const next = await this.status();
      if (next.running) return;
      await sleep(200);
    }
    throw driverError(
      "Timed out waiting for cua-driver daemon. Run `cua-driver doctor` and grant Accessibility + Screen Recording.",
    );
  }

  async requireBinary(): Promise<string> {
    const binary = await this.resolveBinary();
    if (!binary) {
      throw driverError(
        [
          "cua-driver was not found on PATH.",
          'Install it with: /bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"',
          "Or set CUA_DRIVER_PATH / OPENSKY_DRIVER.",
        ].join(" "),
      );
    }
    return binary;
  }

  async resolveBinary(): Promise<string | null> {
    const candidates = [
      this.options.binaryPath,
      process.env.CUA_DRIVER_PATH,
      process.env.OPENSKY_DRIVER,
      ...pathCandidates("cua-driver"),
      "/usr/local/bin/cua-driver",
      "/opt/homebrew/bin/cua-driver",
      join(this.options.appPath ?? "/Applications/CuaDriver.app", "Contents/MacOS/cua-driver"),
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      if (await isExecutable(candidate)) return candidate;
    }
    return null;
  }

  private callArgs(tool: string, args: Record<string, unknown>): string[] {
    return this.withSocket(["call", "--raw", tool, JSON.stringify(args)]);
  }

  private withSocket(args: string[]): string[] {
    if (!this.options.socket) return args;
    return ["--socket", this.options.socket, ...args];
  }

  private async execDriver(args: string[], timeoutMs: number) {
    const binary = await this.requireBinary();
    return this.exec(binary, args, timeoutMs);
  }

  private exec(
    command: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const env = this.options.env ?? process.env;
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(driverError(`cua-driver timed out after ${timeoutMs}ms (${args.join(" ")})`));
      }, timeoutMs);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });
  }

  private async spawnDetached(binary: string, args: string[]): Promise<void> {
    const child = spawn(binary, args, {
      detached: true,
      stdio: "ignore",
      env: this.options.env ?? process.env,
    });
    child.unref();
  }
}

export function parseDriverOutput(stdout: string): {
  isError: boolean;
  message: string;
  result: DriverResult;
} {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {
      isError: false,
      message: "",
      result: { structured: null, text: "", raw: null },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      isError: false,
      message: "",
      result: { structured: trimmed, text: trimmed, raw: trimmed },
    };
  }

  if (
    isRecord(parsed) &&
    (Array.isArray(parsed.content) || "structuredContent" in parsed || typeof parsed.isError === "boolean")
  ) {
    const structured = parsed.structuredContent ?? extractJsonFromContent(parsed.content);
    const text = contentToText(parsed.content) || stringifyUnknown(structured);
    const isError = parsed.isError === true;
    return {
      isError,
      message: isError ? text || "cua-driver returned an error" : "",
      result: { structured: structured ?? null, text, raw: parsed },
    };
  }

  return {
    isError: false,
    message: "",
    result: {
      structured: parsed,
      text: stringifyUnknown(parsed),
      raw: parsed,
    },
  };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function extractJsonFromContent(content: unknown): unknown {
  const text = contentToText(content);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((item) => (isRecord(item) && item.type === "text" && typeof item.text === "string" ? [item.text] : []))
    .join("\n")
    .trim();
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathCandidates(binaryName: string): string[] {
  const pathValue = process.env.PATH;
  if (!pathValue) return [];
  return pathValue
    .split(delimiter)
    .filter(Boolean)
    .map((entry) => join(entry, binaryName));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function platformTarget(): OpenSkyTarget {
  return detectTarget();
}
