import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { DesktopProgramPolicy } from "./desktop-program.js";
import { evaluationEnvironment } from "./codex.js";
import { configuredAdmission, limitResponse } from "./admission.js";

// Transparent transport guard around the installed native Node REPL. Every
// admitted action/observation still runs in the original @oai/sky backend.
const config = JSON.parse(await readFile(process.env.OPENSKY_NATIVE_REPL_CONFIG!, "utf8"));
const policy = new DesktopProgramPolicy(JSON.parse(process.env.PARITY_DESKTOP_SCOPE!));
const admission = configuredAdmission();
const child = spawn(config.command, config.args ?? [], { env: { ...evaluationEnvironment(), ...config.env }, stdio: ["pipe", "pipe", "pipe"] });
child.stderr.pipe(process.stderr);
let queue = Promise.resolve();
const pending = new Map<unknown, () => void>();
const output = createInterface({ input: child.stdout });
output.on("line", line => {
  const message = JSON.parse(line);
  const completed = !message.method && pending.get(message.id);
  if (completed) {
    if (message.error || message.result?.isError) policy.executionFailed();
    pending.delete(message.id);
  }
  process.stdout.write(`${line}\n`);
  if (completed) completed();
});
child.on("exit", code => {
  process.exitCode = code ?? 1;
  for (const done of pending.values()) done();
  pending.clear();
});
const input = createInterface({ input: process.stdin });
input.on("line", line => {
  const message = JSON.parse(line);
  if (message.method !== "tools/call") { child.stdin.write(`${line}\n`); return; }
  // Analyze the next cell after the previous execution result. Failed native
  // assignments cannot lend screenshot-read authority to stale REPL values.
  queue = queue.then(async () => {
    if (message.params?.name !== "js" || !policy.accepts(message.params.arguments?.code)) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { isError: true, content: [{ type: "text", text: "Evaluation scope: use straight-line native desktop calls for the fixture app only. No helper functions, filesystem, network, or other apps." }] } })}\n`);
      return;
    }
    const limit = admission?.admit();
    if (limit) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: limitResponse(limit) })}\n`);
      return;
    }
    await new Promise<void>(done => {
      pending.set(message.id, done);
      child.stdin.write(`${line}\n`);
    });
  });
});
input.on("close", () => { void queue.finally(() => child.stdin.end()); });
