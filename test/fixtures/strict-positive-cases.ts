import assert from "node:assert/strict";
import { AsyncRepl } from "../../src/async-repl.js";
import { runStrictFixture } from "../strict-process.js";

const cases: Record<string, () => Promise<void>> = {
  "warns on direct writes to prior const bindings without blocking effects": async () => {
    const repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true });
    await repl.evaluate("effects = 0; const handle = 'original'; const object = {value:1};");
    const replaced = await repl.evaluate("const handle = (++effects, 'replacement'); console.log(handle); return effects;");
    assert.equal(replaced.value, 1);
    assert.deepEqual(replaced.logs, ["handle was declared with const; use let for reassignable variables.", "replacement"]);
    const assigned = await repl.evaluate("handle = 'assigned'; return handle;");
    assert.equal(assigned.value, "assigned");
    assert.equal(assigned.logs.length, 1);
    const property = await repl.evaluate("object.value++; return object.value;");
    assert.equal(property.value, 2);
    assert.deepEqual(property.logs, []);
    const local = await repl.evaluate("{ let handle='local'; handle='changed'; } return handle;");
    assert.equal(local.value, "assigned");
    assert.deepEqual(local.logs, []);
    await repl.evaluate("const {x: renamed, ...rest} = {x:1}; const [first] = [2];");
    const patterns = await repl.evaluate("({x:renamed}={x:3}); [first]=[4]; return renamed + first;");
    assert.equal(patterns.value, 7);
    assert.deepEqual(patterns.logs, [
      "renamed was declared with const; use let for reassignable variables.",
      "first was declared with const; use let for reassignable variables.",
    ]);
    await assert.rejects(repl.evaluate("console.log('before failure'); handle='changed'; throw new Error('failure');"), (error: unknown) => {
      assert.deepEqual((error as {logs:string[]}).logs, [
        "handle was declared with const; use let for reassignable variables.", "before failure",
      ]);
      return true;
    });
  },
  "seals strict sandboxes against host injection and code-generation escapes": async () => {
    const repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true });
    assert.throws(() => repl.assign({ host: () => process }), /rejects host values/);
    assert.throws(() => repl.context, /context is sealed/);
    repl.installContextFactory("bridge", `
      return Object.freeze({ ping: () => __host("ping") });
    `, { __host: (value: string) => value });
    const globals = await repl.evaluate("return { process: typeof process, require: typeof require, fetch: typeof fetch, dispatch: typeof __dispatch }");
    assert.deepEqual({ ...(globals.value as Record<string, string>) }, { process: "undefined", require: "undefined", fetch: "undefined", dispatch: "undefined" });
    const extension = await repl.evaluate("return { host: typeof __host, ping: bridge.ping() }");
    assert.deepEqual({ ...(extension.value as Record<string, string>) }, { host: "undefined", ping: "ping" });
    for (const source of [
      `Function("return process")()`,
      `eval("1")`,
      `this.constructor.constructor("return process")()`,
      `bridge.ping.constructor("return process")()`,
      `import("node:fs")`,
    ]) {
      await assert.rejects(() => repl.evaluate(source));
    }
  },
  "times out awaited work, revokes its bridge capability, and poisons instead of wedging": async () => {
    const calls: string[] = [];
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true, timeoutMs: 20 });
    repl.installContextFactory("bridge", `return Object.freeze({ delayed: () => __host() });`, {
      __host: async () => { await delayed; calls.push("late"); },
    });
    // Either the host deadline or the VM's remaining-budget deadline can win.
    await assert.rejects(() => repl.evaluate("await bridge.delayed(); await bridge.delayed(); return 1"), /timed out after 20ms|Script execution timed out/);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(calls, ["late"], "the continuation's second host call must be rejected after revocation");
    await assert.rejects(() => repl.evaluate("return 2"), /evaluator is poisoned/);

    // A completed cell's deferred continuation must not borrow the next cell's
    // generation, even when it wakes while that cell is legitimately active.
    const later = new AsyncRepl({ allowNodeApis: false, strictSandbox: true,
      timeoutMs: 100, awaitTimeoutMs: 2000 });
    let releaseOld!: () => void, releaseCurrent!: () => void, enteredCurrent!: () => void;
    const oldWait = new Promise<void>(resolve => { releaseOld = resolve; });
    const currentWait = new Promise<void>(resolve => { releaseCurrent = resolve; });
    const currentEntered = new Promise<void>(resolve => { enteredCurrent = resolve; });
    let staleCalls = 0;
    later.installContextFactory("bridge", `return Object.freeze({
      old: () => new Promise((resolve, reject) => __old().then(resolve, reject)),
      current: () => new Promise((resolve, reject) => __current().then(resolve, reject)),
      ping: () => __ping()
    });`, { __old: () => oldWait, __current: () => { enteredCurrent(); return currentWait; },
      __ping: () => { staleCalls++; return "unexpected"; } });
    await later.evaluate("bridge.old().then(() => bridge.ping()).catch(error => { state.staleError = String(error); }); return 1");
    const current = later.evaluate("await bridge.current(); return state.staleError");
    await currentEntered;
    releaseOld();
    await new Promise(resolve => setTimeout(resolve, 20));
    releaseCurrent();
    const observed = await current;
    assert.equal(staleCalls, 0);
    assert.match(String(observed.value), /capability is unavailable outside its active evaluation/);
  },
};

await runStrictFixture(import.meta.url, cases);
