import assert from "node:assert/strict";
import { AsyncRepl } from "../../src/async-repl.js";

// The parent launches this in a separate process with a hard wall deadline.
// A VM runtime regression must never wedge the test suite itself.
const sources: Record<string, string> = {
  sync: "while (true) {}",
  then: "function spin(){ return Promise.resolve().then(spin); } return spin()",
  async: "async function spin(){ await 0; return spin(); } return spin()",
};
const source = sources[process.argv[2] ?? "async"];
assert.ok(source, "unknown runtime probe");
let repl: AsyncRepl;
try {
  repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true, timeoutMs: 30 });
} catch (error) {
  assert.match(String(error), /requires a runtime with enforced VM microtask draining/);
  console.log(JSON.stringify({ status: "unsupported", runtime: process.versions }));
  process.exit(0);
}
await assert.rejects(() => repl.evaluate(source), /timed out after 30ms|Script execution timed out/);
await assert.rejects(() => repl.evaluate("return 1"), /evaluator is poisoned/);
console.log(JSON.stringify({ status: "timed-out-and-poisoned", runtime: process.versions }));
