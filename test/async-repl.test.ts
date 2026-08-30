import assert from "node:assert/strict";
import { describe, it } from "bun:test";

import { AsyncRepl, wrapAsync } from "../src/async-repl.js";
import { evalOnServer, ReplServer, serverAlive } from "../src/repl-server.js";
import { makeHarness } from "./harness.ts";

describe("async REPL wrapper", () => {
  it("returns the value of an awaited expression", async () => {
    const repl = new AsyncRepl({
      context: {
        sky: {
          async list_apps() {
            return [{ id: "com.apple.calculator" }];
          },
        },
      },
    });
    const result = await repl.evaluate("await sky.list_apps()");
    assert.deepEqual(result.value, [{ id: "com.apple.calculator" }]);
  });

  it("captures console.log and supports return", async () => {
    const repl = new AsyncRepl({ context: { sky: {} } });
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
    assert.match(wrapAsync("await sky.list_apps()"), /\(async \(\) => \(/);
    assert.match(wrapAsync("const x = 1; return x"), /\(async \(\) => \{/);
  });

  it("serves multi-turn eval over the persistent REPL", async () => {
    const { sky, dir } = await makeHarness();
    const repl = new AsyncRepl({ context: { sky } });
    const server = new ReplServer(repl, `${dir}/home`);
    try {
      const info = await server.start();
      assert.ok(info.port > 0);
      assert.equal(await serverAlive(`${dir}/home`), true);
      const first = await evalOnServer("apps = await sky.list_apps(); return apps.map(a => a.displayName)", {
        homeDir: `${dir}/home`,
      });
      assert.equal(first.ok, true, first.error);
      assert.ok(Array.isArray(first.value) && first.value.includes("Calculator"));
      const second = await evalOnServer("return apps.length", { homeDir: `${dir}/home` });
      assert.equal(second.ok, true, second.error);
      assert.ok(typeof second.value === "number" && second.value >= 1);
    } finally {
      await server.stop();
    }
    assert.equal(await serverAlive(`${dir}/home`), false);
  });
});
