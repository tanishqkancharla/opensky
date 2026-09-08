import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { DesktopProgramPolicy } from "./desktop-program.js";
import { evaluationEnvironment } from "./codex.js";

// Transparent transport guard around the installed native Node REPL. Every
// admitted action/observation still runs in the original @oai/sky backend.
const config = JSON.parse(await readFile(process.env.OPENSKY_NATIVE_REPL_CONFIG!, "utf8"));
const policy = new DesktopProgramPolicy(JSON.parse(process.env.PARITY_DESKTOP_SCOPE!));
const child = spawn(config.command, config.args ?? [], { env: { ...evaluationEnvironment(), ...config.env }, stdio: ["pipe", "pipe", "pipe"] });
child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
child.on("exit", code => { process.exitCode = code ?? 1; });
const input = createInterface({ input: process.stdin });
input.on("line", line => {
  const message = JSON.parse(line);
  if (message.method === "tools/call" && (message.params?.name !== "js" || !policy.accepts(message.params.arguments?.code))) {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { isError: true, content: [{ type: "text", text: "Evaluation scope: use straight-line native desktop calls for the fixture app only. No helper functions, filesystem, network, or other apps." }] } })}\n`);
    return;
  }
  child.stdin.write(`${line}\n`);
});
input.on("close", () => { child.stdin.end(); });
