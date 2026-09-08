import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile } from "node:fs/promises";
import { runCodex } from "./codex.js";
import { withOwnedMacApp } from "./mac-app.js";
import { verifyDriverRuntime } from "./driver-runtime.js";
import { runProfile } from "./run-profile.js";

const artifacts = resolve(process.argv[2] ?? `evals/runs/parity-preflight-${Date.now()}`);
const mode = process.argv[3] ?? "native-mcp";
if (!["native-mcp", "native-repl", "opensky"].includes(mode)) throw new Error(`Unknown backend: ${mode}`);
const profile = runProfile();
const driverSocket = process.env.OPENSKY_DRIVER_SOCKET ?? process.env.CUA_DRIVER_SOCKET;
await mkdir(artifacts, { recursive: true });
if (mode === "opensky") await verifyDriverRuntime({ binaryPath: process.env.OPENSKY_DRIVER_BINARY!, socket: driverSocket, artifacts });
const nodeConfig = mode === "native-repl" ? JSON.parse(await readFile(process.env.OPENSKY_NATIVE_REPL_CONFIG!, "utf8")) : undefined;
const mcp = mode === "native-repl" ? { command: nodeConfig.command, args: nodeConfig.args, env: nodeConfig.env, enabled_tools: ["js", "js_reset"] }
  : mode === "opensky" ? { command: process.execPath, args: ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("evals/parity/opensky-mcp.ts")], env: { OPENSKY_HOME: join(artifacts, "sdk-home"), OPENSKY_DRIVER_BINARY: process.env.OPENSKY_DRIVER_BINARY!, ...(driverSocket ? { OPENSKY_DRIVER_SOCKET: driverSocket } : {}) } }
  : { command: join(homedir(), ".codex/.tmp/bundled-marketplaces/openai-bundled/plugins/computer-use/bin/computer-use-client-launcher"), args: ["mcp"], enabled_tools: ["get_app_state"] };
const instructions = mode === "native-repl" ? 'Use desktop.js to import the real API with globalThis.sky = (await import("@oai/sky")).sky; then nodeRepl.write((await sky.get_app_state({app:"com.apple.calculator"})).text).'
  : mode === "opensky" ? 'Use desktop.cua_repl and let app = await cua.getApp("Calculator"). Creation automatically emits the state; do not duplicate it.'
  : 'Use desktop.get_app_state once for com.apple.calculator.';
const result = await withOwnedMacApp({ bundleId: "com.apple.calculator", appPath: "/System/Applications/Calculator.app", artifacts }, () => runCodex({
  model: "gpt-5.6-terra", cwd: join(artifacts, "workspace"), artifacts,
  timeoutMs: profile.timeoutMs, maxToolCalls: profile.maxToolCalls,
  mcp,
  authorizedApps: { "com.apple.calculator": "Calculator" },
  authorizedReplCodes: ['let app = await cua.getApp("Calculator");', 'let app = await cua.getApp("Calculator")'],
  prompt: `Read-only capability preflight for a user-authorized local evaluation. ${instructions} Report the displayed value. Do not change the calculation, send input, or use any other app. If access fails, report it and stop. A matching final answer alone is not evidence of success.`,
}));
const calls = result.items.filter(item => item.type === "mcpToolCall");
const observedText = (calls[0]?.result?.content ?? []).filter((block: { type: string }) => block.type === "text").map((block: { text: string }) => block.text).join("\n");
const hasCalculatorState = /AXWindow[^\n]*Calculator/.test(observedText) && /AXStaticText/.test(observedText) && /AXButton/.test(observedText);
const success = result.turn.status === "completed" && !result.interruption && calls.length === 1 &&
  calls[0]?.server === "desktop" && calls[0]?.status === "completed" && !calls[0]?.result?.isError && hasCalculatorState;
console.log(JSON.stringify({ capabilityPreflight: success ? "passed" : "failed", artifacts, toolCalls: result.toolCalls, usage: result.usage, interruption: result.interruption, finalText: result.finalText }, null, 2));
if (!success) process.exitCode = 1;
