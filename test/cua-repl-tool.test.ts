import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "bun:test";

import { createCuaReplToolRuntime, CUA_REPL_TOOL_NAMES } from "../evals/cua-repl-tool.js";
import type { DriverClient, DriverResult } from "../src/types.js";

describe("single-tool native-style cua evaluator", () => {
  it("has one schema, persists JS state, and does not duplicate emitted results", async () => {
    const runtime = createCuaReplToolRuntime(driver(), "mac", {
      homeDir: await mkdtemp(join(tmpdir(), "opensky-cua-repl-")),
    });
    try {
      assert.deepEqual(CUA_REPL_TOOL_NAMES, ["cua_repl"]);
      assert.equal(runtime.tools.length, 1);
      const tool = runtime.tools[0]!;
      const first = await execute(tool, "one", { code: "counter = 40; return ++counter" });
      const second = await execute(tool, "two", { code: "return ++counter" });
      assert.equal(first.content[0]?.type, "text");
      assert.equal((first.content[0] as { text: string }).text, "41");
      assert.equal((second.content[0] as { text: string }).text, "42");

      const observed = await execute(tool, "apps", { code: "await cua.listApps()" });
      assert.equal(observed.content.length, 1, "the emitted list and expression result must be deduplicated");
      assert.match((observed.content[0] as { text: string }).text, /Example/);
      assert.deepEqual(
        (observed.details as { cuaCalls: Array<{ op: string; status: string }> }).cuaCalls.map(({ op, status }) => ({ op, status })),
        [{ op: "listApps", status: "completed" }],
      );

      runtime.cua.getApp = async () => ({
        targetHandle: "tgt_fake",
        toJSON: () => ({ targetHandle: "tgt_fake", kind: "app" }),
        getAXState: async (options = {}) => {
          runtime.cua.emit("AX tree", options);
          return "AX tree";
        },
      }) as never;
      const observedAX = await execute(tool, "ax", {
        code: `app = await cua.getApp("Example"); await app.getAXState()`,
      });
      assert.deepEqual(observedAX.content, [{ type: "text", text: "AX tree" }], "getAXState emission and result must appear once");
      assert.deepEqual(
        (observedAX.details as { cuaCalls: Array<{ op: string }> }).cuaCalls.map(({ op }) => op),
        ["getApp", "target.getAXState"],
      );
    } finally {
      await runtime.close();
    }
  });

  it("keeps the host bridge lexical and rejects process/fs/network escape routes", async () => {
    const runtime = createCuaReplToolRuntime(driver(), "mac", {
      homeDir: await mkdtemp(join(tmpdir(), "opensky-cua-repl-")),
    });
    try {
      const tool = runtime.tools[0]!;
      const globals = await execute(tool, "globals", {
        code: "return {process:typeof process,require:typeof require,fetch:typeof fetch,dispatch:typeof __dispatch}",
      });
      const text = (globals.content[0] as { text: string }).text;
      assert.match(text, /\"process\": \"undefined\"/);
      assert.match(text, /\"dispatch\": \"undefined\"/);
      for (const code of [
        `Function("return process")()`,
        `eval("1")`,
        `this.constructor.constructor("return process")()`,
        `cua.getState.constructor("return process")()`,
        `import("node:fs")`,
      ]) {
        await assert.rejects(() => execute(tool, "escape", { code }));
      }
    } finally {
      await runtime.close();
    }
  });
});

function execute(
  tool: ReturnType<typeof createCuaReplToolRuntime>["tools"][number],
  id: string,
  params: { code: string; title?: string },
) {
  return tool.execute(id, params, undefined, undefined, {} as never);
}

function driver(): DriverClient {
  return {
    async ensureDaemon() {},
    async status() { return { running: true, text: "running" }; },
    async call(tool, args = {}): Promise<DriverResult> {
      if (tool === "list_apps") {
        return result({ apps: [{ name: "Example", bundle_id: "com.example", running: true }] });
      }
      if (tool === "end_session") return result({ status: "ok", session: args.session });
      throw new Error(`Unexpected driver call ${tool}`);
    },
  };
}

function result(structured: unknown): DriverResult {
  return { structured, text: JSON.stringify(structured), raw: structured };
}
