import assert from "node:assert/strict";
import { createHook } from "node:async_hooks";
import { AsyncRepl, AsyncReplError } from "../../src/index.js";

// This process must survive naturally after a refusal. A marker before SIGABRT
// is not success; the parent enforces both a wall bound and the real exit status.
const mode = process.argv[2];
const kind = process.argv[3] ?? "then";
const runaway = kind === "async"
  ? "async function spin(){ await 0; return spin(); } return spin()"
  : "function spin(){ return Promise.resolve().then(spin); } return spin()";
assert.ok(["preloaded", "late", "between-turns"].includes(mode));
const repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true, timeoutMs: 30, awaitTimeoutMs: 500 });
const hook = createHook({ init() {} });
let entered = 0, continued = 0;
repl.installContextFactory("bridge", `return Object.freeze({
  enter: () => __enter(), continued: () => __continued(),
  pause: () => new Promise((resolve, reject) => __pause().then(resolve, reject))
});`, {
  __enter: () => { entered++; },
  __continued: () => { continued++; },
  __pause: () => new Promise<void>(resolve => setTimeout(() => { hook.enable(); resolve(); }, 5)),
});
if (mode === "late") hook.enable();
let observed: unknown;
try {
  await repl.evaluate(`bridge.enter(); ${mode === "between-turns" ? "await bridge.pause(); bridge.continued();" : ""} ${runaway}`);
} catch (error) { observed = error; }
const effects = { entered, continued };
console.log(JSON.stringify({ stage: "refusal", mode, kind, effects,
  code: observed instanceof AsyncReplError ? observed.code : undefined,
  evaluatorUsable: observed instanceof AsyncReplError ? observed.evaluatorUsable : undefined }));
assert.ok(observed instanceof AsyncReplError);
assert.equal(observed.code, "strict_runtime_unsupported");
assert.equal(observed.evaluatorUsable, false);
assert.deepEqual(effects, { entered: mode === "between-turns" ? 1 : 0, continued: 0 });
await assert.rejects(() => repl.evaluate("bridge.continued(); return 1"), /evaluator is poisoned/);
// Keep the external hook enabled while crossing a subsequent native callback.
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(continued, 0);
hook.disable();
console.log(JSON.stringify({ status: "refused-and-alive", mode, kind, effects }));
