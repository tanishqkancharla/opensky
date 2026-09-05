import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createCuaReplToolRuntime, CUA_REPL_TOOL_NAMES } from "../evals/cua-repl-tool.js";
import type { DriverClient, DriverResult } from "../src/types.js";

describe("single-tool native-style cua evaluator", () => {
  it("rejects invalid browser arguments before the bridge can discard them", async () => {
    const calls: string[] = [];
    const runtime = createCuaReplToolRuntime({
      async call(tool, args = {}): Promise<DriverResult> {
        calls.push(tool);
        if (tool === "list_apps") return result({ apps: [{ name: "Google Chrome", bundle_id: "com.google.chrome", running: true }] });
        if (tool === "end_session") return result({ session: args.session, active: false });
        throw new Error(`Unexpected driver call ${tool}`);
      },
    }, "mac", { homeDir: await mkdtemp(join(tmpdir(), "opensky-browser-args-")) });
    try {
      const tool = runtime.tools[0]!;
      const invalid = await execute(tool, "invalid-browser-args", { code: `
        const attempts = [
          () => cua.getBrowser('chrome'), () => cua.getBrowser(null),
          () => cua.getBrowser({browser:'chrome'}), () => cua.getBrowser({id:42}),
          () => cua.getBrowser({id:'chrome',extra:undefined}),
          () => cua.getBrowser({}, 'extra'),
          () => cua.createBrowserTab('chrome','https://example.com','eval'),
          () => cua.createBrowserTab('chrome','https://example.com',{sessionName:()=>{}}),
          () => cua.createBrowserTab('chrome','https://example.com',{visible:'yes'})
        ];
        const messages = [];
        for (const attempt of attempts) { try { await attempt(); messages.push('UNEXPECTED SUCCESS'); } catch (error) { messages.push(error.message); } }
        return messages;
      ` });
      const invalidText = JSON.stringify(invalid.content);
      assert.doesNotMatch(invalidText, /UNEXPECTED SUCCESS/);
      assert.equal((invalidText.match(/Invalid params/g) ?? []).length, 9);
      assert.deepEqual(calls, [], "invalid bridge calls must never reach the driver");
      await execute(tool, "valid-browser", { code: "browser = await cua.getBrowser({id:'chrome'});" });
      const before = calls.length;
      const invalidNew = await execute(tool, "invalid-new", { code: `
        const errors = [];
        for (const arg of ['https://example.com', {}, undefined]) {
          try { await browser.tabs.new(arg); errors.push('UNEXPECTED SUCCESS'); }
          catch (error) { errors.push(error.message); }
        }
        return errors;
      ` });
      assert.equal((JSON.stringify(invalidNew.content).match(/takes no arguments/g) ?? []).length, 3);
      assert.equal(calls.length, before, "tabs.new arguments must not open a blank tab");
    } finally {
      await runtime.close();
    }
  });

  it("has one schema, persists JS state, and does not duplicate emitted results", async () => {
    const runtime = createCuaReplToolRuntime(driver(), "mac", {
      homeDir: await mkdtemp(join(tmpdir(), "opensky-cua-repl-")),
    });
    try {
      assert.deepEqual(CUA_REPL_TOOL_NAMES, ["cua_repl"]);
      assert.equal(runtime.tools.length, 1);
      const tool = runtime.tools[0]!;
      assert.match(tool.description, /scroll\(index \| \[x, y\], direction, pages\?\)/);
      assert.match(tool.description, /drag\(\[fromX, fromY\], \[toX, toY\]\)/);
      assert.match(tool.description, /fresh exact-tab screenshot/);
      assert.match(tool.description, /not complete surrounding context/);
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
        const blocked = await execute(tool, "escape", { code });
        assert.equal(blocked.isError, true, `${code} must be reported as a tool error`);
        const errorText = blocked.content
          .filter((item): item is { type: "text"; text: string } => item.type === "text")
          .map((item) => item.text)
          .join("\n");
        assert.match(
          errorText,
          /Code generation from strings disallowed|dynamic import callback was not specified/,
          `${code} must be blocked inside the sandbox rather than executed by the host`,
        );
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
      if (tool === "end_session") return result({ session: args.session, active: false });
      throw new Error(`Unexpected driver call ${tool}`);
    },
  };
}

function result(structured: unknown): DriverResult {
  return { structured, text: JSON.stringify(structured), raw: structured };
}
