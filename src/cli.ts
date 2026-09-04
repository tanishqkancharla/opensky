#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { inspect } from "node:util";
import { pathToFileURL } from "node:url";

import { AsyncRepl, startInteractiveRepl } from "./async-repl.js";
import { CuaDriverClient } from "./driver.js";
import { homeDir } from "./platform.js";
import { evalOnServer, ReplServer, serverAlive } from "./repl-server.js";
import { createOpenSky } from "./opensky.js";
import { createCua } from "./cua.js";
import { installSkill, skillDestinations, uninstallSkill } from "./skill-install.js";

const HELP = `opensky — async Node REPL for computer-use

Usage:
  opensky                     Start an interactive async REPL with opensky preloaded
  opensky repl                Same as above
  opensky eval <code>         Evaluate async JavaScript (top-level await)
  opensky -e <code>           Same as eval
  opensky run <file>          Run a .js file as an async script
  opensky serve              Start a persistent REPL server for multi-turn eval
  opensky stop               Stop the persistent REPL server
  opensky doctor             Install the desktop helper if needed and check status
  opensky skill install      Copy the opensky skill into agent skill directories
  opensky skill add           Alias for skill install
  opensky skill uninstall    Remove installed opensky skill copies

Options:
  --json                  Print eval results as JSON
  --no-serve              Do not reuse a running persistent REPL
  --global, -g            Install the skill into ~/.agent/skills (user-level)
  --home <dir>            Override OPENSKY_HOME (default ~/.opensky)
  --driver <path>        Path to the desktop helper binary
  --socket <path>        Path to an existing desktop-helper socket
  --help, -h              Show this help
  --version               Show version

Environment:
  OPENSKY_HOME                      session/screenshot/repl state directory (mode 0700)
  OPENSKY_SESSION                    helper session label (default opensky)
  OPENSKY_REPL_TOKEN                 token for opensky serve (generated into repl.json)
  OPENSKY_AUTOINSTALL=0             do not download the desktop helper
  OPENSKY_DRIVER                    override helper binary path
  CUA_DRIVER_SOCKET                 connect to an existing helper socket

Examples:
  opensky eval 'await opensky.list_apps()'
  opensky eval --json 'const s = await opensky.get_app_state({app:"Calculator", disableDiff:true}); return s.text'
`;

async function main(argv = process.argv.slice(2)): Promise<number> {
  const { command, args, flags } = parseArgs(argv);
  if (flags.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (flags.version) {
    process.stdout.write(`${await readVersion()}\n`);
    return 0;
  }

  switch (command) {
    case "help":
      process.stdout.write(`${HELP}\n`);
      return 0;
    case "repl":
    case undefined:
    case "":
      if (args.length === 0) {
        return runRepl(flags);
      }
      return runEval(args.join(" "), flags);
    case "eval":
    case "e":
    case "-e":
      return runEval(args.join(" "), flags);
    case "run":
      return runFile(args[0], flags);
    case "serve":
      return runServe(flags);
    case "stop":
      return runStop(flags);
    case "doctor":
      return runDoctor(flags);
    case "skill":
      return runSkill(args, flags);
    default:
      if (command.startsWith("-")) {
        return runEval(argv.filter((item) => item !== "--json" && item !== "--no-serve").join(" "), flags);
      }
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}\n`);
      return 1;
  }
}

async function runEval(code: string, flags: Flags): Promise<number> {
  const source = code.trim() || (await readStdin());
  if (!source.trim()) {
    process.stderr.write("opensky eval requires code or stdin\n");
    return 1;
  }
  const home = homeDir(flags.home);
  if (!flags.noServe && (await serverAlive(home))) {
    const response = await evalOnServer(source, { homeDir: home });
    return printEval(response.ok, response.value, response.logs, response.error, flags);
  }
  const { opensky, extra } = createContext(flags);
  const repl = new AsyncRepl({ context: { opensky, ...extra } });
  try {
    const result = await repl.evaluate(source);
    return printEval(true, result.value, result.logs, undefined, flags);
  } catch (error) {
    const logs = error && typeof error === "object" && "logs" in error ? (error as { logs: string[] }).logs : [];
    return printEval(false, undefined, logs, error instanceof Error ? error.message : String(error), flags);
  } finally {
    await opensky.close();
  }
}

async function runFile(file: string | undefined, flags: Flags): Promise<number> {
  if (!file) {
    process.stderr.write("opensky run requires a file path\n");
    return 1;
  }
  const source = await readFile(file, "utf8");
  return runEval(source, { ...flags, noServe: true });
}

async function runRepl(flags: Flags): Promise<number> {
  const { opensky, extra } = createContext(flags);
  const server = startInteractiveRepl({
    context: { opensky, ...extra },
    prompt: "opensky> ",
  });
  return new Promise((resolve) => {
    server.on("exit", () => void opensky.close().finally(() => resolve(0)));
  });
}

async function runServe(flags: Flags): Promise<number> {
  const home = homeDir(flags.home);
  const { opensky, extra } = createContext(flags);
  const repl = new AsyncRepl({ context: { opensky, ...extra }, allowNodeApis: false });
  const server = new ReplServer(repl, home);
  const info = await server.start();
  process.stdout.write(
    `opensky REPL server listening on 127.0.0.1:${info.port} (pid ${info.pid})\nAuth token stored in ${join(home, "repl.json")} (mode 0600)\n`,
  );
  const shutdown = async () => {
    await Promise.all([server.stop(), opensky.close()]);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  return new Promise(() => undefined);
}

async function runStop(flags: Flags): Promise<number> {
  const home = homeDir(flags.home);
  const alive = await serverAlive(home);
  if (!alive) {
    process.stdout.write("opensky REPL server is not running\n");
    return 0;
  }
  const { readServerInfo } = await import("./repl-server.js");
  const info = await readServerInfo(home);
  if (info) {
    try {
      process.kill(info.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  process.stdout.write("stopped opensky REPL server\n");
  return 0;
}

async function runDoctor(flags: Flags): Promise<number> {
  const driver = new CuaDriverClient({
    binaryPath: flags.driver,
    socket: flags.socket ?? process.env.CUA_DRIVER_SOCKET,
    autoStart: true,
  });
  let helperError: string | undefined;
  try {
    await driver.ensureHelper();
    await driver.ensureDaemon();
    if (process.platform === "darwin") {
      await driver.grantPermissions();
    }
  } catch (error) {
    helperError = error instanceof Error ? error.message : String(error);
  }
  const binary = await driver.resolveBinary();
  const status = await driver.status();
  const permissions = await driver.permissionStatus();
  const home = homeDir(flags.home);
  const repl = await serverAlive(home);
  const report = {
    target: process.platform,
    desktopHelper: binary,
    helperRunning: status.running,
    helperStatus: status.text,
    permissions,
    openskyHome: home,
    replServer: repl,
    ...(helperError ? { error: helperError } : {}),
  };
  process.stdout.write(`${inspect(report, { colors: false, depth: 4 })}\n`);
  if (helperError || !binary || !status.running) {
    if (process.platform === "darwin") {
      process.stderr.write(
        "If the helper is installed but not running, enable Accessibility and Screen Recording in System Settings for the app that appeared (it may be labeled CuaDriver), then run `opensky doctor` again.\n",
      );
    }
    return 1;
  }
  return 0;
}

async function runSkill(args: string[], flags: Flags): Promise<number> {
  const action = args[0] ?? "install";
  const options = {
    global: Boolean(flags.global),
    cwd: process.cwd(),
  };
  if (action === "install" || action === "add") {
    const result = await installSkill(options);
    process.stdout.write(`Installed opensky skill from ${result.source}\n`);
    for (const destination of result.destinations) {
      process.stdout.write(`  ${destination}\n`);
    }
    process.stdout.write(
      [
        "",
        "You can also add the skill with the Agent Skills CLI:",
        "  npx skills add . --skill opensky",
        "  npx skills add . --skill opensky -g",
        "",
      ].join("\n"),
    );
    return 0;
  }
  if (action === "uninstall" || action === "remove") {
    const removed = await uninstallSkill(options);
    process.stdout.write("Removed:\n");
    for (const destination of removed) process.stdout.write(`  ${destination}\n`);
    return 0;
  }
  if (action === "paths") {
    for (const destination of skillDestinations(options)) process.stdout.write(`${destination}\n`);
    return 0;
  }
  process.stderr.write(`Unknown skill command: ${action}\n`);
  return 1;
}

function createContext(flags: Flags) {
  const opensky = createOpenSky({
    homeDir: flags.home,
    driver: new CuaDriverClient({
      binaryPath: flags.driver ?? process.env.CUA_DRIVER_PATH ?? process.env.OPENSKY_DRIVER,
      session: process.env.OPENSKY_SESSION ?? "opensky",
      socket: flags.socket ?? process.env.CUA_DRIVER_SOCKET,
      autoStart: process.env.OPENSKY_AUTOSTART !== "0",
    }),
  });
  const extra = {
    cua: createCua(opensky),
    driver: opensky.driver,
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    state: {},
    readFile,
    pathToFileURL,
  };
  return { opensky, extra };
}

function printEval(
  ok: boolean,
  value: unknown,
  logs: string[],
  error: string | undefined,
  flags: Flags,
): number {
  for (const line of logs) process.stdout.write(`${line}\n`);
  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ ok, value, error, logs }, null, 2)}\n`);
    return ok ? 0 : 1;
  }
  if (!ok) {
    process.stderr.write(`${error ?? "eval failed"}\n`);
    return 1;
  }
  if (value !== undefined) {
    process.stdout.write(`${inspect(value, { depth: 6, colors: false })}\n`);
  }
  return 0;
}

interface Flags {
  json: boolean;
  noServe: boolean;
  global: boolean;
  help: boolean;
  version: boolean;
  home?: string;
  driver?: string;
  socket?: string;
}

function parseArgs(argv: string[]): { command?: string; args: string[]; flags: Flags } {
  const flags: Flags = { json: false, noServe: false, global: false, help: false, version: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--no-serve") flags.noServe = true;
    else if (arg === "--global" || arg === "-g") flags.global = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--version") flags.version = true;
    else if (arg === "--home") flags.home = argv[++i];
    else if (arg === "--driver") flags.driver = argv[++i];
    else if (arg === "--socket") flags.socket = argv[++i];
    else if (arg === "-e" || arg === "--eval") {
      positional.push("eval", argv[++i] ?? "");
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0], args: positional.slice(1), flags };
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readVersion(): Promise<string> {
  try {
    const url = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(await readFile(url, "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

void main().then(
  (code) => {
    if (code !== undefined && Number.isFinite(code)) process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);

export { main };
