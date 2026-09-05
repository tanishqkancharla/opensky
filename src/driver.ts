import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";

import { driverError } from "./errors.js";
import { detectTarget } from "./platform.js";
import type { DriverClient, DriverResult, OpenSkyTarget } from "./types.js";

export interface CuaDriverOptions {
  binaryPath?: string;
  appPath?: string;
  timeoutMs?: number;
  autoStart?: boolean;
  autoInstall?: boolean;
  startTimeoutMs?: number;
  session?: string;
  socket?: string;
  env?: NodeJS.ProcessEnv;
}

const INSTALL_SH = "https://cua.ai/driver/install.sh";
const INSTALL_PS1 = "https://cua.ai/driver/install.ps1";
const PERMISSION_HELP =
  "In System Settings, enable Accessibility and Screen Recording for the desktop helper that appeared (it may be labeled CuaDriver), then run `opensky doctor` again.";

const DEFAULT_TIMEOUT_MS = 30_000;

export class CuaDriverClient implements DriverClient {
  readonly sessionOwnership = { kind: "cli-explicit" } as const;
  private daemonReady = false;

  constructor(private readonly options: CuaDriverOptions = {}) {}

  async call(tool: string, args: Record<string, unknown> = {}): Promise<DriverResult> {
    await this.ensureDaemon();
    const payload = { ...args };
    if (this.options.session && payload.session === undefined) {
      payload.session = this.options.session;
    }

    let result = await this.execDriver(this.callArgs(tool, payload), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let parsed = parseDriverOutput(result.stdout);

    // Long-lived REPLs and one-shot CLI calls may reuse a session that the
    // daemon has expired. Native Computer Use hides this lifecycle detail, so
    // revive an explicitly named session once and replay the rejected call.
    // The rejected call did not run, making this retry safe even for actions.
    if (
      tool !== "start_session" &&
      this.options.session &&
      payload.session === this.options.session &&
      isPreDispatchSessionEnded(parsed.result)
    ) {
      const revived = await this.execDriver(
        this.callArgs("start_session", { session: this.options.session }),
        this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      const revivedParsed = parseDriverOutput(revived.stdout);
      const revivalRefusal = refusalFromResult(revivedParsed.result);
      if (revived.code !== 0 || revivedParsed.isError || revivalRefusal) {
        throw driverError(
          revivalRefusal?.message || revivedParsed.message || revived.stderr.trim() || "desktop helper session could not be revived.",
          revivalRefusal?.code,
          revivedParsed.result.structured,
        );
      }
      result = await this.execDriver(this.callArgs(tool, payload), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      parsed = parseDriverOutput(result.stdout);
    }

    if (result.code !== 0 && !result.stdout.trim()) {
      throw driverError((result.stderr || result.stdout || `${tool} failed with exit ${result.code}`).trim());
    }

    if (parsed.isError || result.code !== 0) {
      const refusal = refusalFromResult(parsed.result);
      throw driverError(
        refusal?.message || parsed.message || result.stderr.trim() || `${tool} failed.`,
        refusal?.code,
        parsed.result.structured,
      );
    }
    const refusal = refusalFromResult(parsed.result);
    if (refusal) throw driverError(refusal.message, refusal.code, parsed.result.structured);
    return parsed.result;
  }

  async status(): Promise<{ running: boolean; text: string }> {
    const binary = await this.resolveBinary();
    if (!binary) {
      return { running: false, text: "desktop helper not found" };
    }
    const result = await this.exec(binary, this.withSocket(["status"]), 4_000);
    return {
      running: result.code === 0,
      text: (result.stdout || result.stderr).trim() || `exit ${result.code}`,
    };
  }

  async ensureHelper(): Promise<string> {
    const existing = await this.resolveBinary();
    if (existing) return existing;
    const override = this.binaryOverride();
    if (override) {
      throw driverError(`opensky desktop helper is not installed or executable at the configured path ${JSON.stringify(override)}. Correct --driver or the helper binary environment override.`);
    }
    if (!this.autoInstallEnabled()) {
      throw driverError("opensky desktop helper is not installed. Run `opensky doctor`.");
    }

    process.stderr.write("Installing opensky desktop helper…\n");
    const installed = await runOfficialInstaller(detectTarget(), this.driverEnv());
    if (installed.code !== 0) {
      throw driverError(
        [
          "opensky could not install the desktop helper.",
          (installed.stderr || installed.stdout).trim() || `installer exited ${installed.code}`,
          "Check your network and retry `opensky doctor`.",
        ].join(" "),
      );
    }

    const binary = await this.resolveBinary();
    if (!binary) {
      throw driverError("opensky installed the desktop helper but could not find it. Retry `opensky doctor`.");
    }
    return binary;
  }

  async grantPermissions(): Promise<{ stdout: string; stderr: string; code: number }> {
    const binary = await this.ensureHelper();
    return this.exec(binary, this.withSocket(["permissions", "grant"]), 120_000);
  }

  async permissionStatus(): Promise<Record<string, unknown> | null> {
    const binary = await this.resolveBinary();
    if (!binary) return null;
    const result = await this.exec(binary, this.withSocket(["permissions", "status", "--json"]), 4_000);
    try {
      return JSON.parse(result.stdout) as Record<string, unknown>;
    } catch {
      return result.stdout || result.stderr
        ? { status: (result.stdout || result.stderr).trim(), exitCode: result.code }
        : null;
    }
  }

  async ensureDaemon(): Promise<void> {
    if (this.daemonReady) return;
    await this.ensureHelper();
    const status = await this.status();
    if (status.running) {
      this.daemonReady = true;
      return;
    }
    if (this.options.autoStart === false) {
      throw driverError("opensky desktop helper is not running. Run `opensky doctor`.");
    }

    const binary = await this.requireBinary();
    const target = detectTarget();
    if (target === "mac") {
      const appPath = this.configuredAppPath() ?? await appBundleForDriver(binary);
      // Reuse an in-flight helper launch. `open -n` creates competing daemon
      // instances when multiple first-run commands arrive together.
      const opened = appPath ? await this.exec(
        "/usr/bin/open",
        ["-g", appPath, "--args", ...this.withSocket(["serve", "--no-overlay"])],
        3_000,
      ) : undefined;
      if (!opened || opened.code !== 0) {
        await this.spawnDetached(binary, this.withSocket(["serve", "--no-overlay"]));
      }
    } else if (target === "win") {
      await this.exec(binary, this.withSocket(["autostart", "kick"]), 15_000);
      const afterKick = await this.status();
      if (!afterKick.running) {
        await this.spawnDetached(binary, this.withSocket(["serve", "--no-overlay"]));
      }
    } else {
      await this.spawnDetached(binary, this.withSocket(["serve", "--no-overlay"]));
    }

    const deadline = Date.now() + (this.options.startTimeoutMs ?? 10_000);
    while (Date.now() < deadline) {
      const next = await this.status();
      if (next.running) {
        this.daemonReady = true;
        return;
      }
      await sleep(200);
    }
    throw driverError(`Timed out waiting for the opensky desktop helper. ${PERMISSION_HELP}`);
  }

  async requireBinary(): Promise<string> {
    return this.ensureHelper();
  }

  async resolveBinary(): Promise<string | null> {
    const override = this.binaryOverride();
    if (override) {
      return (await isExecutable(override)) ? override : null;
    }
    const candidates = [
      ...pathCandidates("cua-driver", this.driverEnv().PATH),
      ...defaultHelperPaths(this.configuredAppPath()),
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      if (await isExecutable(candidate)) return candidate;
    }
    return null;
  }

  private autoInstallEnabled(): boolean {
    if (this.options.autoInstall === false) return false;
    // An explicit selection must never silently install/use another helper.
    if (this.binaryOverride()) return false;
    const env = this.options.env ?? process.env;
    if (env.OPENSKY_AUTOINSTALL === "0") return false;
    return true;
  }

  private binaryOverride(): string | undefined {
    const env = this.options.env ?? process.env;
    // Preserve the legacy PATH-over-OPENSKY precedence; the new BINARY alias
    // takes priority over both. An API/CLI path always wins.
    return this.options.binaryPath || env.CUA_DRIVER_BINARY || env.CUA_DRIVER_PATH || env.OPENSKY_DRIVER;
  }

  private configuredAppPath(): string | undefined {
    return this.options.appPath || (this.options.env ?? process.env).CUA_DRIVER_APP_PATH;
  }

  private driverEnv(): NodeJS.ProcessEnv {
    const env = { ...(this.options.env ?? process.env) };
    const localBin = join(homedir(), ".local", "bin");
    const current = env.PATH ?? "";
    if (!current.split(delimiter).includes(localBin)) {
      env.PATH = current ? `${localBin}${delimiter}${current}` : localBin;
    }
    return env;
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
    const env = this.driverEnv();
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
        reject(driverError(`desktop helper timed out after ${timeoutMs}ms`));
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
      env: this.driverEnv(),
    });
    child.unref();
  }
}

/** Only this exact admission refusal proves that the rejected operation did not run. */
export function isPreDispatchSessionEnded(result: DriverResult): boolean {
  const structured = asRecord(result.structured);
  const refusal = asRecord(structured?.refusal);
  return structured?.status === "refused" && refusal?.code === "session_ended" &&
    structured.effect === undefined && structured.delivery === undefined &&
    refusal.detail === undefined;
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
      message: isError ? text || "desktop helper returned an error" : "",
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

function refusalFromResult(result: DriverResult): { code?: string; message: string } | null {
  const diagnostic = isRecord(result.raw) ? contentToText(result.raw.content) : undefined;
  return parseDriverRefusal(result.structured, diagnostic);
}

/** Normalize refusals; diagnostic text alone can never classify an outcome. */
export function parseDriverRefusal(structured: unknown, diagnosticText?: string): { code?: string; message: string } | null {
  if (!isRecord(structured)) return null;
  const explicitRefusal = isRecord(structured.refusal) ? structured.refusal : undefined;
  if (structured.effect !== "refused" && structured.status !== "refused" &&
      !firstNonemptyString(explicitRefusal?.code, explicitRefusal?.message)) return null;

  const nested = explicitRefusal ?? structured;
  const reason = isRecord(nested.reason) ? nested.reason : undefined;
  const code = firstNonemptyString(nested.code, reason?.code);
  const exactMessage = firstNonemptyString(
    reason?.message, reason?.detail, nested.reason, nested.message, structured.reason, structured.message,
  );
  const escalation = isRecord(structured.escalation) ? structured.escalation : undefined;
  // These are the closed public ActionResult enums, not an inferred refusal
  // code or permission to switch routes. Many exact causes share one reason.
  const target = escalation?.target;
  const escalationReason = escalation?.reason;
  const validEscalation = typeof target === "string" && ["pixel", "foreground", "page", "session"].includes(target) &&
    typeof escalationReason === "string" && ["route_unavailable", "delivery_failed", "effect_unconfirmed", "suspected_noop", "permission_required"].includes(escalationReason);
  const fallback = validEscalation
    ? `The desktop helper refused the request. Driver escalation: target=${target}, reason=${escalationReason}.`
    : "The desktop helper refused the request.";
  const detail = isRecord(nested.detail) ? nested.detail : undefined;
  const delivery = isRecord(structured.delivery) ? structured.delivery : undefined;
  const unknownDelivery = delivery?.mode === "unknown" || structured.delivery === "unknown" || detail?.delivery === "unknown";
  const message = boundedDiagnostic(firstNonemptyString(exactMessage, diagnosticText, code) ?? fallback);
  return {
    code: code && code.length <= 256 ? code : undefined,
    message: message + (unknownDelivery ? " Action delivery is unknown; do not retry automatically." : ""),
  };
}

function firstNonemptyString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function boundedDiagnostic(value: string, limit = 4_000): string {
  if (value.length <= limit) return value;
  // Keep both ends: a final delivery warning must not disappear behind a long
  // platform error. This is a display bound, not evidence that a retry is safe.
  const marker = " …[truncated]… ";
  const prefix = Math.floor((limit - marker.length) * 0.75);
  return value.slice(0, prefix) + marker + value.slice(-(limit - marker.length - prefix));
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

/** Resolve symlinks and accept only an executable directly in an app's MacOS directory. */
export async function appBundleForDriver(binary: string): Promise<string | undefined> {
  try {
    const executable = await realpath(binary);
    const macOS = dirname(executable);
    const contents = dirname(macOS);
    const app = dirname(contents);
    return basename(macOS) === "MacOS" && basename(contents) === "Contents" && basename(app).endsWith(".app")
      ? app
      : undefined;
  } catch {
    return undefined;
  }
}

function defaultHelperPaths(appPath?: string): string[] {
  const home = homedir();
  const app = appPath ?? "/Applications/CuaDriver.app";
  return [
    join(home, ".local", "bin", "cua-driver"),
    join(home, ".local", "bin", "cua-driver.exe"),
    "/usr/local/bin/cua-driver",
    "/opt/homebrew/bin/cua-driver",
    join(app, "Contents/MacOS/cua-driver"),
  ];
}

function pathCandidates(binaryName: string, pathValue = process.env.PATH): string[] {
  if (!pathValue) return [];
  return pathValue
    .split(delimiter)
    .filter(Boolean)
    .map((entry) => join(entry, binaryName));
}

function runOfficialInstaller(
  target: OpenSkyTarget,
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; code: number }> {
  if (target === "win") {
    return execCommand(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `irm ${INSTALL_PS1} | iex`],
      env,
      180_000,
    );
  }
  return execCommand("bash", ["-lc", `curl -fsSL ${INSTALL_SH} | bash`], env, 180_000);
}

function execCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number }> {
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
      reject(driverError(`desktop helper installer timed out after ${timeoutMs}ms`));
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function platformTarget(): OpenSkyTarget {
  return detectTarget();
}
