import assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { AsyncRepl, wrapAsync } from "../src/async-repl.js";
import { evalOnServer, ReplServer, serverAlive } from "../src/repl-server.js";
import { makeHarness } from "./harness.ts";

describe("async REPL wrapper", () => {
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
});
