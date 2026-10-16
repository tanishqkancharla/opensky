import { runStrictCase } from "./strict-process.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { AsyncRepl, wrapAsync } from "../src/async-repl.js";
import { evalOnServer, ReplServer, serverAlive } from "../src/repl-server.js";
import { makeHarness } from "./harness.ts";

describe("async REPL wrapper", () => {
  it("keeps ordinary context assignment, descriptors, and async values without a VM proxy", async () => {
    const repl = new AsyncRepl({ allowNodeApis: false, context: { answer: async () => 42 } });
    repl.assign({ initial: 3 });
    const result = await repl.evaluate("const answerValue = await answer(); globalThis.extra = initial; return answerValue");
    assert.equal(result.value, 42);
    assert.equal(repl.context.answerValue, 42);
    assert.equal(repl.context.extra, 3);
    Object.defineProperty(repl.context, "configured", { value: 5, writable: true, configurable: true });
    assert.equal((await repl.evaluate("configured += extra; return configured")).value, 8);
    const globals = (await repl.evaluate("return { process: typeof process, require: typeof require }")).value as Record<string, string>;
    assert.deepEqual({ ...globals }, { process: "undefined", require: "undefined" });
    assert.equal((await repl.evaluate("delete extra; return typeof extra")).value, "undefined");
    await assert.rejects(repl.evaluate("missingBinding"), /missingBinding|not defined|Can't find/);
  });

  it("warns on direct writes to prior const bindings without blocking effects", () =>
    runStrictCase(new URL("./fixtures/strict-positive-cases.ts", import.meta.url), "warns on direct writes to prior const bindings without blocking effects"));

  it("returns the value of an awaited expression", async () => {
    const repl = new AsyncRepl({
      context: {
        opensky: {
          async list_apps() {
            return [{ id: "com.apple.calculator" }];
          },
        },
      },
    });
    const result = await repl.evaluate("await opensky.list_apps()");
    assert.deepEqual(result.value, [{ id: "com.apple.calculator" }]);
  });

  it("captures console.log and supports return", async () => {
    const repl = new AsyncRepl({ context: { opensky: {} } });
    const result = await repl.evaluate(`console.log("hi"); return 42`);
    assert.equal(result.value, 42);
    assert.deepEqual(result.logs, ["hi"]);
  });

  it("persists bindings across evaluations", async () => {
    const repl = new AsyncRepl();
    await repl.evaluate("n = 1");
    const result = await repl.evaluate("n += 1; return n");
    assert.equal(result.value, 2);
  });

  it("wraps expressions vs statements", () => {
    assert.match(wrapAsync("await opensky.list_apps()"), /\(async \(\) => \(/);
    assert.match(wrapAsync("const x = 1; return x"), /\(async \(\) => \{/);
    assert.match(wrapAsync("{value: await answer()}"), /\(async \(\) => \(/);
  });

  it("exposes standard JS globals such as Date and Number", async () => {
    const repl = new AsyncRepl({ context: { opensky: {} } });
    const result = await repl.evaluate(`return { now: Date.now(), n: Number("2"), t: typeof Number }`);
    assert.equal((result.value as { n: number }).n, 2);
    assert.equal((result.value as { t: string }).t, "function");
    assert.equal(typeof (result.value as { now: number }).now, "number");
  });

  it("serves multi-turn eval over the persistent REPL", async () => {
    const { opensky, dir } = await makeHarness();
    const repl = new AsyncRepl({ context: { opensky }, allowNodeApis: false });
    const server = new ReplServer(repl, `${dir}/home`);
    try {
      const info = await server.start();
      assert.ok(info.port > 0);
      assert.ok(info.token.length > 8);
      assert.equal(await serverAlive(`${dir}/home`), true);
      const { stat } = await import("node:fs/promises");
      const mode = (await stat(`${dir}/home/repl.json`)).mode & 0o777;
      assert.equal(mode, 0o600);
      const first = await evalOnServer("apps = await opensky.list_apps(); return apps.map(a => a.displayName)", {
        homeDir: `${dir}/home`,
      });
      assert.equal(first.ok, true, first.error);
      assert.ok(Array.isArray(first.value) && first.value.includes("Calculator"));
      const second = await evalOnServer("return apps.length", { homeDir: `${dir}/home` });
      assert.equal(second.ok, true, second.error);
      assert.ok(typeof second.value === "number" && second.value >= 1);
      const denied = await evalOnServer("return 1", { homeDir: `${dir}/home`, token: null });
      assert.equal(denied.ok, false);
      assert.match(denied.error ?? "", /unauthorized/);
      const nodeApis = await evalOnServer("return { require: typeof require, process: typeof process }", {
        homeDir: `${dir}/home`,
      });
      assert.equal(nodeApis.ok, true, nodeApis.error);
      assert.deepEqual(nodeApis.value, { require: "undefined", process: "undefined" });
    } finally {
      await server.stop();
    }
    assert.equal(await serverAlive(`${dir}/home`), false);
  });

  it("refuses duplicate servers and never removes another owner's metadata", async () => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const home = await mkdtemp(`${tmpdir()}/opensky-server-owner-`);
    const first = new ReplServer(new AsyncRepl(), home);
    const duplicate = new ReplServer(new AsyncRepl(), home);
    try {
      await first.start();
      const original = await readFile(`${home}/repl.json`, "utf8");
      await assert.rejects(duplicate.start(), /already|exists|owned/i);
      await duplicate.stop();
      assert.equal(await readFile(`${home}/repl.json`, "utf8"), original);
      assert.equal((await evalOnServer("return 42", { homeDir: home })).value, 42);
    } finally { await duplicate.stop(); await first.stop(); await rm(home, { recursive: true, force: true }); }
  });

  it("waits for a persistent cell longer than the former 15-second client deadline", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const home = await mkdtemp(`${tmpdir()}/opensky-server-wait-`);
    const repl = new AsyncRepl({ awaitTimeoutMs: null });
    const server = new ReplServer(repl, home);
    try {
      await server.start();
      const response = await evalOnServer("await new Promise(resolve => setTimeout(resolve, 15500)); let finished = true; return finished", { homeDir: home });
      assert.equal(response.ok, true, response.error);
      assert.equal(response.value, true);
      assert.equal((await evalOnServer("return finished", { homeDir: home })).value, true);
    } finally { await server.stop(); await rm(home, { recursive: true, force: true }); }
  });

  it("stops a server with a pending cell and reports its unknown outcome", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const home = await mkdtemp(`${tmpdir()}/opensky-server-stop-`);
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const repl = new AsyncRepl({ awaitTimeoutMs: null, context: { block: async () => { entered(); await pending; } } });
    const server = new ReplServer(repl, home);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await server.start();
      const result = evalOnServer("await block(); return 42", { homeDir: home });
      const refused = assert.rejects(result, /may have executed|without a result/);
      await started;
      await Promise.race([server.stop(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("server stop stranded by pending cell")), 100);
      })]);
      await refused;
      assert.equal(await serverAlive(home), false);
    } finally { if (timer) clearTimeout(timer); release(); await server.stop(); await rm(home, { recursive: true, force: true }); }
  });

  it("seals strict sandboxes against host injection and code-generation escapes", () =>
    runStrictCase(new URL("./fixtures/strict-positive-cases.ts", import.meta.url), "seals strict sandboxes against host injection and code-generation escapes"));

  it("times out awaited work, revokes its bridge capability, and poisons instead of wedging", () =>
    runStrictCase(new URL("./fixtures/strict-positive-cases.ts", import.meta.url), "times out awaited work, revokes its bridge capability, and poisons instead of wedging"));

  for (const kind of ["sync", "then", "async"]) {
    it(`interrupts ${kind} runaway work in an externally bounded Node process`, () => {
      const probe = fileURLToPath(new URL("./fixtures/strict-runtime-probe.ts", import.meta.url));
      const child = spawnSync(process.execPath, ["--import", "tsx", probe, kind], {
        encoding: "utf8", timeout: 5_000, killSignal: "SIGKILL",
      });
      assert.equal(child.error, undefined, String(child.error));
      assert.equal(child.signal, null, child.stderr);
      assert.equal(child.status, 0, child.stderr);
      assert.equal(JSON.parse(child.stdout).status, "timed-out-and-poisoned");
    });
  }

  for (const mode of ["preloaded", "late", "between-turns"]) {
    for (const kind of ["then", "async"]) {
      it(`refuses ${mode} host promise tracking before ${kind} runaway work`, () => {
        const probe = fileURLToPath(new URL("./fixtures/strict-host-tracking-probe.ts", import.meta.url));
        const args = mode === "preloaded"
          ? ["--import", fileURLToPath(new URL("./fixtures/strict-legacy-hook.mjs", import.meta.url))]
          : [];
        const child = spawnSync(process.execPath, [...args, "--import", "tsx", probe, mode, kind], {
          encoding: "utf8", timeout: 5_000, killSignal: "SIGKILL",
        });
        assert.equal(child.error, undefined, String(child.error));
        assert.equal(child.signal, null, child.stderr);
        assert.equal(child.status, 0, child.stderr);
        const lines = child.stdout.trim().split("\n").map(line => JSON.parse(line));
        assert.deepEqual(lines[0].effects, { entered: mode === "between-turns" ? 1 : 0, continued: 0 });
        assert.equal(lines[0].code, "strict_runtime_unsupported");
        assert.equal(lines[0].evaluatorUsable, false);
        assert.equal(lines[1].status, "refused-and-alive");
      });
    }
  }

  it("requires Bun to reject unsupported strict mode or enforce the same timeout contract", (t) => {
    const available = spawnSync("bun", ["--version"], { encoding: "utf8", timeout: 5_000 });
    if (available.error && "code" in available.error && available.error.code === "ENOENT") return t.skip("Bun is not installed");
    assert.equal(available.status, 0, available.stderr);
    const probe = fileURLToPath(new URL("./fixtures/strict-runtime-probe.ts", import.meta.url));
    const child = spawnSync("bun", [probe, "async"], { encoding: "utf8", timeout: 5_000, killSignal: "SIGKILL" });
    assert.equal(child.error, undefined, String(child.error));
    assert.equal(child.signal, null, child.stderr);
    assert.equal(child.status, 0, child.stderr);
    assert.ok(["unsupported", "timed-out-and-poisoned"].includes(JSON.parse(child.stdout).status));
  });
});
