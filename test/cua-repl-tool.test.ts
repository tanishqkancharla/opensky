import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createCuaReplToolRuntime, CUA_REPL_TOOL_NAMES } from "../evals/cua-repl-tool.js";
import type { DriverClient, DriverResult } from "../src/types.js";

describe("single-tool native-style cua evaluator", () => {
  it("keeps emit:false and plain expressions silent, with explicit ordered nodeRepl output", async () => {
    const runtime = createCuaReplToolRuntime(driver(), "mac", { homeDir: await mkdtemp(join(tmpdir(), "opensky-output-")) });
    try {
      const tool = runtime.tools[0]!;
      const silent = await execute(tool, "silent", { code: "await cua.listApps({emit:false})" });
      assert.deepEqual(silent.content, []);
      assert.deepEqual((await execute(tool, "expression", { code: "40 + 2" })).content, []);
      const emitted = await execute(tool, "ordered", { code: `
        nodeRepl.write("before");
        await cua.listApps();
        nodeRepl.write("after");
        nodeRepl.write(undefined);
      ` });
      assert.equal(emitted.content.length, 4);
      assert.equal((emitted.content[0] as {text:string}).text, "before");
      assert.match((emitted.content[1] as {text:string}).text, /Example/);
      assert.equal((emitted.content[2] as {text:string}).text, "after");
      assert.equal((emitted.content[3] as {text:string}).text, "undefined");
    } finally { await runtime.close(); }
  });

  it("emits explicit images on every request and retains output before an error", async () => {
    const runtime = createCuaReplToolRuntime(driver(), "mac", { homeDir: await mkdtemp(join(tmpdir(), "opensky-image-output-")) });
    try {
      const tool = runtime.tools[0]!;
      const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWKsAAAAASUVORK5CYII=";
      for (const id of ["first", "again"]) {
        const response = await execute(tool, id, { code: `await nodeRepl.emitImage(${JSON.stringify(png)})` });
        assert.deepEqual(response.content, [{ type: "image", mimeType: "image/png", data: png.split(",")[1] }]);
      }
      const failed = await execute(tool, "failed", { code: `nodeRepl.write("completed prefix"); await nodeRepl.emitImage("file:///private/test.png");` });
      assert.equal(failed.isError, true);
      assert.equal((failed.content[0] as {text:string}).text, "completed prefix");
      assert.match(JSON.stringify(failed.content), /host asset resolver/);
      const safe = await execute(tool, "safe", { code: "nodeRepl.write(typeof __output); nodeRepl.write(typeof nodeRepl.emitImage.constructor);" });
      assert.equal((safe.content[0] as {text:string}).text, "undefined");
      const escape = await execute(tool, "image-escape", { code: 'nodeRepl.write.constructor("return process")()' });
      assert.equal(escape.isError, true);
    } finally { await runtime.close(); }
  });
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
        nodeRepl.write(JSON.stringify(messages));
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
        nodeRepl.write(JSON.stringify(errors));
      ` });
      assert.equal((JSON.stringify(invalidNew.content).match(/takes no arguments/g) ?? []).length, 3);
      assert.equal(calls.length, before, "tabs.new arguments must not open a blank tab");
      const invalidUrl = await execute(tool, "invalid-null-url", { code: "await cua.createBrowserTab('chrome', null)" });
      assert.equal(invalidUrl.isError, true);
      assert.match(JSON.stringify(invalidUrl.content), /URL must be a string/);
      assert.equal(calls.length, before, "an explicit null URL must not become an omitted URL");
      const omittedUrl = await execute(tool, "omitted-url", { code: "await cua.createBrowserTab('chrome')" });
      // This double intentionally stops at preparation. The facade tests prove
      // blank-tab success; here we prove omission survives the JSON boundary.
      assert.equal(omittedUrl.isError, true);
      assert.match(JSON.stringify(omittedUrl.content), /Unexpected driver call browser_prepare/);
      assert.ok(calls.includes("browser_prepare"));
    } finally {
      await runtime.close();
    }
  });

  it("exposes evaluation and waiting, persists JS state, and does not duplicate emitted results", async () => {
    const runtime = createCuaReplToolRuntime(driver(), "mac", {
      homeDir: await mkdtemp(join(tmpdir(), "opensky-cua-repl-")),
    });
    try {
      assert.deepEqual(CUA_REPL_TOOL_NAMES, ["cua_repl", "cua_repl_wait"]);
      assert.equal(runtime.tools.length, 2);
      const tool = runtime.tools[0]!;
      assert.match(tool.description, /scroll\(index \| \[x, y\], direction, pages\?\)/);
      assert.match(tool.description, /drag\(\[fromX, fromY\], \[toX, toY\]\)/);
      assert.match(tool.description, /fresh exact-tab screenshot/);
      assert.match(tool.description, /complete matches do not imply complete surrounding evidence/);
      assert.match(tool.description, /getAXState\(\{continuation: token\}\)/);
      const first = await execute(tool, "one", { code: "counter = 40; nodeRepl.write(++counter)" });
      const second = await execute(tool, "two", { code: "nodeRepl.write(++counter)" });
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

  it("emits each requested screenshot once and keeps silent bridge results diagnostic", async () => {
    const screenshots: Buffer[] = [];
    const homeDir = await mkdtemp(join(tmpdir(), "opensky-cua-repl-bytes-"));
    const runtime = createCuaReplToolRuntime(screenshotDriver(screenshots), "mac", {
      homeDir,
      settleDelayMs: 0,
    });
    try {
      const tool = runtime.tools[0]!;
      await execute(tool, "bind-app", { code: "app = await cua.getApp('Example');" });

      const emitted = await execute(tool, "emitted-screenshot", {
        code: "await app.getAXStateAndScreenshot({emit:true})",
      });
      assert.equal((emitted.details as { emissions: number }).emissions, 1);
      assert.deepEqual(emitted.content.map((item) => item.type), ["text", "image"]);
      assert.equal(
        emitted.content.filter((item) => item.type === "text").length,
        1,
        "the host emission and VM expression result represent one observation",
      );
      assert.deepEqual(
        (emitted.details as { result: { screenshot: unknown } }).result.screenshot,
        { __cuaBytes: screenshots.at(-1)!.toString("base64") },
      );
      assert.equal((emitted.content[1] as { type: "image"; data: string }).data, screenshots.at(-1)!.toString("base64"));

      const silent = await execute(tool, "silent-screenshot", {
        code: "await app.getAXStateAndScreenshot({emit:false})",
      });
      assert.equal((silent.details as { emissions: number }).emissions, 0);
      assert.deepEqual(silent.content, [], "emit:false must suppress implicit expression output");

      const sliced = await execute(tool, "sliced-screenshot", {
        code: `
          const slicedObservation = await app.getAXStateAndScreenshot({emit:false});
          return slicedObservation.screenshot.subarray(1, slicedObservation.screenshot.length - 1);
        `,
      });
      const expectedSlice = screenshots.at(-1)!.subarray(1, screenshots.at(-1)!.length - 1);
      assert.equal((sliced.details as { emissions: number }).emissions, 0);
      assert.deepEqual(sliced.content, [], "return values are diagnostic only, not public output");
      assert.deepEqual(
        (sliced.details as { result: unknown }).result,
        { __cuaBytes: expectedSlice.toString("base64") },
        "a cross-realm byte view must preserve its nonzero offset and bounded length",
      );

      const different = await execute(tool, "different-screenshot", {
        code: `
          const differentObservation = await app.getAXStateAndScreenshot({emit:true});
          return {
            state: differentObservation.state + "\\ngenuinely different",
            screenshot: differentObservation.screenshot.subarray(1),
          };
        `,
      });
      assert.equal((different.details as { emissions: number }).emissions, 1);
      assert.deepEqual(different.content.map((item) => item.type), ["text", "image"]);
      const differentBytes = screenshots.at(-1)!;
      assert.equal((different.content[1] as { type: "image"; data: string }).data, differentBytes.toString("base64"));
    } finally {
      await runtime.close();
      await rm(homeDir, { recursive: true, force: true });
    }
  });

  it("keeps the host bridge lexical and rejects process/fs/network escape routes", async () => {
    const runtime = createCuaReplToolRuntime(driver(), "mac", {
      homeDir: await mkdtemp(join(tmpdir(), "opensky-cua-repl-")),
    });
    try {
      const tool = runtime.tools[0]!;
      const globals = await execute(tool, "globals", {
        code: "nodeRepl.write(JSON.stringify({process:typeof process,require:typeof require,fetch:typeof fetch,dispatch:typeof __dispatch}, null, 2))",
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

function screenshotDriver(screenshots: Buffer[]): DriverClient {
  return {
    async ensureDaemon() {},
    async status() { return { running: true, text: "running" }; },
    async call(tool, args = {}): Promise<DriverResult> {
      if (tool === "list_apps") {
        return result({ apps: [{ name: "Example", bundle_id: "com.example", pid: 123, running: true }] });
      }
      if (tool === "list_windows") {
        return result({ windows: [{ window_id: 7, pid: 123, is_on_screen: true, title: "Example", frame: { x: 0, y: 0, width: 800, height: 600 } }] });
      }
      if (tool === "get_window_state") {
        // Serialization fixture bytes only; this does not test image decoding or real-driver acceptance.
        const screenshot = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, screenshots.length + 1]);
        if (args.include_screenshot === true && typeof args.screenshot_out_file === "string") {
          screenshots.push(screenshot);
          await writeFile(args.screenshot_out_file, screenshot);
        }
        return result({
          pid: 123,
          window_id: 7,
          snapshot_id: `snapshot-${screenshots.length}`,
          tree_markdown: '[0] AXStaticText "Example state"',
          elements: [{ element_index: 0, role: "AXStaticText", label: "Example state" }],
          elements_complete: true,
          screenshot_file_path: args.include_screenshot === true ? args.screenshot_out_file : undefined,
          frame: { x: 0, y: 0, width: 800, height: 600 },
        });
      }
      if (tool === "end_session") return result({ session: args.session, active: false });
      throw new Error(`Unexpected driver call ${tool}`);
    },
  };
}

function result(structured: unknown): DriverResult {
  return { structured, text: JSON.stringify(structured), raw: structured };
}
